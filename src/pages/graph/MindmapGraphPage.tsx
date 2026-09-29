import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Controls, MiniMap, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react'
import type { Edge, Node, NodeChange, OnNodeDrag } from '@xyflow/react'
import { useLatest } from 'ahooks'
import type { GraphNodeData } from '@/logic/graph'
import { buildGraphNodeDetails } from '@/logic/graphViewModel'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useI18n } from '@/i18n/useI18n'
import { useGraphAutoLayout } from '@/pages/useGraphAutoLayout'
import { MindmapToolbar } from '@/pages/graph/MindmapToolbar'
import { getMiniMapNodeColor, shouldRenderGraphMiniMap } from '@/pages/graph/graphMiniMap'
import {
  fitViewOptions,
  nodeTypes,
  proOptions,
  type GraphFlowInstance,
  type GraphPageProps,
} from '@/pages/graph/graphPageConfig'
import {
  applyMindmapSelection,
  buildMindmapModel,
  getMindmapVisibility,
  resolveMindmapDropIntent,
} from '@/pages/graph/mindmapModel'
import { useMindmapInteractions } from '@/pages/graph/useMindmapInteractions'
import type { MindmapNodeActions } from '@/components/GraphNodes'
import '@/styles/app/_mindmap.scss'

export const MindmapGraphPage = (props: GraphPageProps) => {
  const { t } = useI18n()
  const darkMode = useDarkMode()
  const [nodes, setNodes, onNodesChange] = useNodesState(props.graph.nodes)
  const [edges, setEdges] = useEdgesState(props.graph.edges)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [flowInstance, setFlowInstance] = useState<GraphFlowInstance>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const dragStartRef = useRef<{ id: string; position: { x: number; y: number } } | null>(null)
  const updateTitleRef = useLatest(props.onUpdateHeadingTitle)
  const updateContentRef = useLatest(props.onUpdateHeadingContent)
  const updateTitle = useCallback(
    (id: string, title: string) => updateTitleRef.current(id, title),
    [updateTitleRef],
  )
  const updateContent = useCallback<NonNullable<GraphNodeData['onUpdateContent']>>(
    (id, content, blocks) => updateContentRef.current(id, content, blocks),
    [updateContentRef],
  )

  useGraphAutoLayout({
    contentMode: props.contentMode,
    editable: props.editable,
    flowInstance,
    graph: props.graph,
    onUpdateHeadingContent: updateContent,
    onUpdateHeadingTitle: updateTitle,
    setNodes,
  })
  useEffect(() => setEdges(props.graph.edges), [props.graph.edges, setEdges])

  const model = useMemo(() => buildMindmapModel(nodes, edges), [edges, nodes])
  const visibility = useMemo(() => getMindmapVisibility(model, collapsedIds), [collapsedIds, model])
  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id)
      setNodes((current) => applyMindmapSelection(current, id))
    },
    [setNodes],
  )
  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<GraphNodeData>>[]) => {
      onNodesChange(changes)
      const nextSelectedId = changes.reduce<string | null>(
        (id, change) => (change.type === 'select' && change.selected ? change.id : id),
        null,
      )
      setSelectedId((current) => {
        if (nextSelectedId) return nextSelectedId
        if (
          current &&
          changes.some(
            (change) => change.type === 'select' && change.id === current && !change.selected,
          )
        )
          return null
        return current
      })
      if (nextSelectedId) queueMicrotask(() => shellRef.current?.focus())
    },
    [onNodesChange],
  )
  const handleCanvasMouseDownCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as Element
    const node = target.closest<HTMLElement>('[data-graph-node-id]')
    if (!node || target.closest('button, input, textarea')) return
    const nodeId = node.dataset.graphNodeId
    if (nodeId) setSelectedId(nodeId)
    if (event.detail > 1) return
    if (target.closest('[contenteditable]:not([contenteditable="false"])')) {
      event.preventDefault()
    }
    queueMicrotask(() => shellRef.current?.focus())
  }, [])
  const handleNodeClick = useCallback((_event: ReactMouseEvent, node: Node<GraphNodeData>) => {
    setSelectedId(node.id)
    queueMicrotask(() => shellRef.current?.focus())
  }, [])
  const interactions = useMindmapInteractions({
    addChild: props.onAddChildHeading,
    addSibling: props.onAddSiblingHeading,
    collapsedIds,
    deleteHeading: props.onDeleteHeading,
    editable: props.editable,
    flowInstance,
    insertParent: props.onInsertParentHeading,
    model,
    nodes: visibility.visibleNodes,
    redo: props.onRedo,
    reorder: props.onReorderHeading,
    select,
    selectedId,
    setCollapsedIds,
    shellRef,
    undo: props.onUndo,
  })
  const renderedNodes = useMemo(
    () =>
      visibility.visibleNodes.map((node) => {
        const hiddenCount = visibility.hiddenCountById.get(node.id)
        if (node.id !== selectedId && !hiddenCount) return node
        const mindmap: MindmapNodeActions = {
          edit: interactions.edit,
          hiddenCount,
          toggleFold: interactions.toggleFold,
          ...(node.id === selectedId && props.editable
            ? {
                addChild: interactions.addChild,
                addSibling: interactions.addSibling,
              }
            : {}),
        }
        return { ...node, data: { ...node.data, mindmap } }
      }),
    [
      interactions.addChild,
      interactions.addSibling,
      interactions.edit,
      interactions.toggleFold,
      props.editable,
      selectedId,
      visibility,
    ],
  )
  const details = useMemo(
    () => buildGraphNodeDetails(nodes, edges, selectedId),
    [edges, nodes, selectedId],
  )

  const handleDragStop = useCallback<OnNodeDrag<Node<GraphNodeData>>>(
    (_event, node) => {
      const center = {
        x: node.position.x + (node.measured?.width ?? node.width ?? 180) / 2,
        y: node.position.y + (node.measured?.height ?? node.height ?? 56) / 2,
      }
      const intent = resolveMindmapDropIntent(model, node.id, center)
      if (intent) props.onMoveHeading?.(node.id, intent.targetId, intent.placement)
      const start = dragStartRef.current
      if (start?.id === node.id) {
        setNodes((current) =>
          current.map((item) =>
            item.id === node.id ? { ...item, position: start.position } : item,
          ),
        )
      }
      dragStartRef.current = null
    },
    [model, props, setNodes],
  )

  return (
    <div
      ref={shellRef}
      data-presentation="mindmap"
      aria-label={t('graph.canvasLabel')}
      className="mindmap-canvas relative h-full bg-background outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
      role="region"
      tabIndex={0}
      onMouseDownCapture={handleCanvasMouseDownCapture}
      onMouseDown={interactions.handleMouseDown}
    >
      <MindmapToolbar
        contentMode={props.contentMode}
        editable={props.editable}
        details={details}
        onContentModeChange={props.onContentModeChange}
        onOpenPath={props.onOpenFile}
        t={t}
      />
      <ReactFlow<Node<GraphNodeData>, Edge>
        colorMode={darkMode ? 'dark' : 'light'}
        className="h-full w-full"
        nodes={renderedNodes}
        edges={visibility.visibleEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onInit={setFlowInstance}
        nodesDraggable={props.editable}
        nodesConnectable={false}
        deleteKeyCode={null}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        preventScrolling
        onlyRenderVisibleElements
        minZoom={0.15}
        maxZoom={2.2}
        zoomOnDoubleClick={false}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={(_event, node) => interactions.edit(node.id)}
        onNodeDragStart={(_event, node) => {
          dragStartRef.current = { id: node.id, position: node.position }
        }}
        onNodeDragStop={handleDragStop}
        fitView
        fitViewOptions={fitViewOptions}
        proOptions={proOptions}
      >
        <Controls showInteractive={false} />
        {shouldRenderGraphMiniMap(props.showMiniMap, renderedNodes.length) ? (
          <MiniMap pannable zoomable className="!bg-card/90" nodeColor={getMiniMapNodeColor} />
        ) : null}
      </ReactFlow>
    </div>
  )
}
