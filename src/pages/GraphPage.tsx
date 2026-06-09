import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLatest } from 'ahooks'
import { GitGraph } from 'lucide-react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import type { Edge, Node, NodeTypes, OnSelectionChangeParams } from '@xyflow/react'
import type { GraphContentMode } from '@/store/appTypes'
import type { GraphData, GraphNodeData } from '@/logic/graph'
import { mergeGraphNodePositions } from '@/logic/graphViewState'
import { ExternalNode, HeadingNode, MissingNode } from '@/components/GraphNodes'
import { useI18n } from '@/i18n/useI18n'
import { useGraphKeyboardActions } from '@/pages/useGraphKeyboardActions'

const nodeTypes: NodeTypes = { external: ExternalNode, missing: MissingNode, heading: HeadingNode }
const fitViewOptions = { padding: 0.22 }
const proOptions = { hideAttribution: true }

const getMiniMapNodeColor = (node: Node) =>
  node.type === 'heading'
    ? 'hsl(var(--primary))'
    : node.type === 'missing'
      ? 'hsl(var(--destructive))'
      : node.type === 'external'
        ? '#f59e0b'
        : 'hsl(var(--muted-foreground))'

type GraphPageProps = {
  graph: GraphData
  onOpenFile: (path: string) => void
  showMiniMap: boolean
  contentMode: GraphContentMode
  editable: boolean
  onAddChildHeading: (nodeId: string) => string | null
  onAddSiblingHeading: (nodeId: string) => string | null
  onAddSiblingHeadingBefore: (nodeId: string) => string | null
  onDeleteHeading: (nodeId: string) => string | null
  onUpdateHeadingTitle: (nodeId: string, title: string) => void
  onUpdateHeadingContent: NonNullable<GraphNodeData['onUpdateContent']>
}

const GraphPageComponent = ({
  graph,
  onOpenFile,
  showMiniMap,
  contentMode,
  editable,
  onAddChildHeading,
  onAddSiblingHeading,
  onAddSiblingHeadingBefore,
  onDeleteHeading,
  onUpdateHeadingTitle,
  onUpdateHeadingContent,
}: GraphPageProps) => {
  const { t } = useI18n()
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)
  const [selectedHeadingId, setSelectedHeadingId] = useState<string | null>(null)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    Node<GraphNodeData>,
    Edge
  > | null>(null)
  const graphShellRef = useRef<HTMLDivElement | null>(null)
  const layoutKeyRef = useRef(graph.layoutKey)
  const onUpdateHeadingTitleRef = useLatest(onUpdateHeadingTitle)
  const onUpdateHeadingContentRef = useLatest(onUpdateHeadingContent)

  const handleUpdateHeadingTitle = useCallback(
    (nodeId: string, title: string) => {
      onUpdateHeadingTitleRef.current(nodeId, title)
    },
    [onUpdateHeadingTitleRef],
  )

  const handleUpdateHeadingContent = useCallback<NonNullable<GraphNodeData['onUpdateContent']>>(
    (nodeId, content, contentBlocks) => {
      onUpdateHeadingContentRef.current(nodeId, content, contentBlocks)
    },
    [onUpdateHeadingContentRef],
  )

  useEffect(() => {
    const preservePositions = layoutKeyRef.current === graph.layoutKey
    const nextNodes = graph.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        contentMode,
        editable: editable && node.type === 'heading',
        onUpdateTitle: handleUpdateHeadingTitle,
        onUpdateContent: handleUpdateHeadingContent,
      },
    }))
    setNodes((currentNodes) => mergeGraphNodePositions(nextNodes, currentNodes, preservePositions))
    layoutKeyRef.current = graph.layoutKey
  }, [
    contentMode,
    editable,
    graph.layoutKey,
    graph.nodes,
    handleUpdateHeadingContent,
    handleUpdateHeadingTitle,
    setNodes,
  ])

  useEffect(() => {
    setEdges(graph.edges)
  }, [graph.edges, setEdges])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<GraphNodeData>) => {
      if (editable && node.type === 'heading') return
      if (node.id.startsWith('file:')) {
        onOpenFile(node.id.replace('file:', ''))
        return
      }
      const path = typeof node.data?.path === 'string' ? node.data.path : null
      if (path) {
        onOpenFile(path)
      }
    },
    [editable, onOpenFile],
  )

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams<Node<GraphNodeData>>) => {
      const heading = selectedNodes.find((node) => node.type === 'heading')
      setSelectedHeadingId(heading?.id ?? null)
    },
    [],
  )

  const clearSelection = useCallback(() => {
    setSelectedHeadingId(null)
    setNodes((currentNodes) =>
      currentNodes.map((node) => (node.selected ? { ...node, selected: false } : node)),
    )
  }, [setNodes])

  const selectHeading = useCallback(
    (nodeId: string | null) => {
      const nextId = nodeId?.startsWith('heading:') ? nodeId : null
      setSelectedHeadingId(nextId)
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const selected = Boolean(nextId && node.id === nextId)
          return node.selected === selected ? node : { ...node, selected }
        }),
      )
    },
    [setNodes],
  )

  const { handleGraphMouseDown, visibleEdges, visibleNodes } = useGraphKeyboardActions({
    editable,
    edges,
    flowInstance,
    graphShellRef,
    nodes,
    selectedHeadingId,
    clearSelection,
    onAddChildHeading,
    onAddSiblingHeading,
    onAddSiblingHeadingBefore,
    onDeleteHeading,
    selectHeading,
  })

  return (
    <div
      ref={graphShellRef}
      className="relative h-full bg-background outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
      tabIndex={0}
      onMouseDown={handleGraphMouseDown}
    >
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm">
        <GitGraph className="h-3.5 w-3.5 text-primary" />
        <span>
          {visibleNodes.length} {t('graph.nodes')}
        </span>
        <span className="h-3 w-px bg-border" />
        <span>
          {visibleEdges.length} {t('graph.edges')}
        </span>
      </div>
      <ReactFlow<Node<GraphNodeData>, Edge>
        className="h-full w-full"
        nodes={visibleNodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={handleSelectionChange}
        onInit={setFlowInstance}
        nodesDraggable
        nodesConnectable={false}
        deleteKeyCode={null}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick
        preventScrolling
        onlyRenderVisibleElements
        minZoom={0.15}
        maxZoom={2.2}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={fitViewOptions}
        proOptions={proOptions}
      >
        <Background gap={16} size={1} />
        <Controls />
        {showMiniMap && (
          <MiniMap pannable zoomable className="!bg-card/90" nodeColor={getMiniMapNodeColor} />
        )}
      </ReactFlow>
      {visibleNodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-md border border-border bg-card/95 p-5 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
              <GitGraph className="h-5 w-5 text-primary" />
            </div>
            <div className="text-sm font-semibold">{t('graph.emptyTitle')}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('graph.emptyDescription')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const GraphPage = React.memo(GraphPageComponent)
export default GraphPage
