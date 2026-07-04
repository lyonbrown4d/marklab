import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLatest } from 'ahooks'
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
import { ExternalNode, HeadingNode, MissingNode, PreviewNode } from '@/components/GraphNodes'
import { useI18n } from '@/i18n/useI18n'
import { useGraphKeyboardActions } from '@/pages/useGraphKeyboardActions'
import type { GraphHotkeyAction } from '@/pages/graphKeyboardActions'
import {
  buildGraphNodeDetails,
  createDefaultGraphFilters,
  filterGraphElements,
  getGraphFilterStats,
  getGraphNodeOpenPath,
  hasActiveGraphFilters,
} from '@/logic/graphViewModel'
import { graphFeedbackKeyByAction } from '@/pages/graph/graphFeedback'
import { GraphEmptyState } from '@/pages/graph/GraphEmptyState'
import { GraphFeedbackToast } from '@/pages/graph/GraphFeedbackToast'
import { GraphHoverPreview } from '@/pages/graph/GraphHoverPreview'
import { GraphInspector } from '@/pages/graph/GraphInspector'
import { GraphToolbar } from '@/pages/graph/GraphToolbar'
import { getMiniMapNodeColor } from '@/pages/graph/graphMiniMap'
import { useGraphHoverPreview } from '@/pages/graph/useGraphHoverPreview'

const nodeTypes: NodeTypes = {
  external: ExternalNode,
  heading: HeadingNode,
  missing: MissingNode,
  preview: PreviewNode,
}
const fitViewOptions = { padding: 0.22 }
const proOptions = { hideAttribution: true }

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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [graphFeedback, setGraphFeedback] = useState<string | null>(null)
  const [graphFilters, setGraphFilters] = useState(createDefaultGraphFilters)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    Node<GraphNodeData>,
    Edge
  > | null>(null)
  const deferredGraphFilters = useDeferredValue(graphFilters)
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

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node<GraphNodeData>) => {
    setSelectedNodeId((current) => (current === node.id ? current : node.id))
  }, [])

  const handleNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node<GraphNodeData>) => {
      event.preventDefault()
      if (editable && node.type === 'heading') return
      const path = getGraphNodeOpenPath(node)
      if (path) onOpenFile(path)
    },
    [editable, onOpenFile],
  )

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams<Node<GraphNodeData>>) => {
      const heading = selectedNodes.find((node) => node.type === 'heading')
      const nextHeadingId = heading?.id ?? null
      const nextNodeId = selectedNodes[0]?.id ?? null
      setSelectedHeadingId((current) => (current === nextHeadingId ? current : nextHeadingId))
      setSelectedNodeId((current) => (current === nextNodeId ? current : nextNodeId))
    },
    [],
  )

  const clearSelection = useCallback(() => {
    setSelectedHeadingId((current) => (current === null ? current : null))
    setSelectedNodeId((current) => (current === null ? current : null))
    setNodes((currentNodes) =>
      currentNodes.some((node) => node.selected)
        ? currentNodes.map((node) => (node.selected ? { ...node, selected: false } : node))
        : currentNodes,
    )
  }, [setNodes])

  const showGraphFeedback = useCallback(
    (action: GraphHotkeyAction) => {
      const key = graphFeedbackKeyByAction[action]
      if (!key) return
      setGraphFeedback(t(key))
    },
    [t],
  )

  useEffect(() => {
    if (!graphFeedback) return
    const timer = window.setTimeout(() => setGraphFeedback(null), 900)
    return () => window.clearTimeout(timer)
  }, [graphFeedback])

  const selectHeading = useCallback(
    (nodeId: string | null) => {
      const nextId = nodeId?.startsWith('heading:') ? nodeId : null
      setSelectedHeadingId((current) => (current === nextId ? current : nextId))
      setSelectedNodeId((current) => (current === nextId ? current : nextId))
      setNodes((currentNodes) =>
        currentNodes.some((node) => node.selected !== Boolean(nextId && node.id === nextId))
          ? currentNodes.map((node) => {
              const selected = Boolean(nextId && node.id === nextId)
              return node.selected === selected ? node : { ...node, selected }
            })
          : currentNodes,
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
    onHotkeyFeedback: showGraphFeedback,
    onAddChildHeading,
    onAddSiblingHeading,
    onAddSiblingHeadingBefore,
    onDeleteHeading,
    selectHeading,
  })

  const filteredGraph = useMemo(
    () => filterGraphElements(visibleNodes, visibleEdges, deferredGraphFilters),
    [deferredGraphFilters, visibleEdges, visibleNodes],
  )
  const filterStats = useMemo(() => getGraphFilterStats(visibleNodes), [visibleNodes])
  const selectedNodeDetails = useMemo(
    () => buildGraphNodeDetails(nodes, edges, selectedNodeId),
    [edges, nodes, selectedNodeId],
  )
  const graphHasActiveFilters = useMemo(() => hasActiveGraphFilters(graphFilters), [graphFilters])
  const filteredGraphHasActiveFilters = useMemo(
    () => hasActiveGraphFilters(deferredGraphFilters),
    [deferredGraphFilters],
  )
  const { clearHoverPreview, hoverNodeDetails, hoverPreview, updateHoverPreview } =
    useGraphHoverPreview({
      edges,
      nodes,
      shellRef: graphShellRef,
    })

  return (
    <div
      ref={graphShellRef}
      className="relative h-full bg-background outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
      tabIndex={0}
      onMouseDown={handleGraphMouseDown}
    >
      <GraphToolbar
        edgeCount={filteredGraph.edges.length}
        filters={graphFilters}
        hasActiveFilters={graphHasActiveFilters}
        nodeCount={filteredGraph.nodes.length}
        onFiltersChange={setGraphFilters}
        stats={filterStats}
        t={t}
        totalEdgeCount={visibleEdges.length}
        totalNodeCount={visibleNodes.length}
      />
      {graphFeedback ? <GraphFeedbackToast message={graphFeedback} /> : null}
      <GraphInspector details={selectedNodeDetails} onOpenPath={onOpenFile} t={t} />
      <GraphHoverPreview details={hoverNodeDetails} position={hoverPreview} t={t} />
      <ReactFlow<Node<GraphNodeData>, Edge>
        className="h-full w-full"
        nodes={filteredGraph.nodes}
        edges={filteredGraph.edges}
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
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeMouseEnter={updateHoverPreview}
        onNodeMouseMove={updateHoverPreview}
        onNodeMouseLeave={clearHoverPreview}
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
      {filteredGraph.nodes.length === 0 && (
        <GraphEmptyState
          title={
            filteredGraphHasActiveFilters ? t('graph.filteredEmptyTitle') : t('graph.emptyTitle')
          }
          description={
            filteredGraphHasActiveFilters
              ? t('graph.filteredEmptyDescription')
              : t('graph.emptyDescription')
          }
        />
      )}
    </div>
  )
}

const GraphPage = React.memo(GraphPageComponent)
export default GraphPage
