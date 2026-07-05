import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLatest } from 'ahooks'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import type { Edge, Node, OnSelectionChangeParams } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { useI18n } from '@/i18n/useI18n'
import { useGraphKeyboardActions } from '@/pages/useGraphKeyboardActions'
import { useGraphAutoLayout } from '@/pages/useGraphAutoLayout'
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
import { GraphInspector } from '@/pages/graph/GraphInspector'
import { GraphToolbar } from '@/pages/graph/GraphToolbar'
import { getMiniMapNodeColor, shouldRenderGraphMiniMap } from '@/pages/graph/graphMiniMap'
import {
  fitViewOptions,
  nodeTypes,
  proOptions,
  type GraphFlowInstance,
  type GraphPageProps,
} from '@/pages/graph/graphPageConfig'

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
  const [flowInstance, setFlowInstance] = useState<GraphFlowInstance>(null)
  const deferredGraphFilters = useDeferredValue(graphFilters)
  const graphShellRef = useRef<HTMLDivElement | null>(null)
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

  useGraphAutoLayout({
    contentMode,
    editable,
    flowInstance,
    graph,
    onUpdateHeadingContent: handleUpdateHeadingContent,
    onUpdateHeadingTitle: handleUpdateHeadingTitle,
    setNodes,
  })

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
  const resetGraphFilters = useCallback(() => {
    setGraphFilters(createDefaultGraphFilters())
  }, [])

  return (
    <div
      ref={graphShellRef}
      aria-label={t('graph.canvasLabel')}
      className="relative h-full bg-background outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
      role="region"
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
        fitView
        fitViewOptions={fitViewOptions}
        proOptions={proOptions}
      >
        <Background gap={16} size={1} />
        <Controls />
        {shouldRenderGraphMiniMap(showMiniMap, filteredGraph.nodes.length) && (
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
          actionLabel={filteredGraphHasActiveFilters ? t('graph.resetFilters') : undefined}
          onAction={filteredGraphHasActiveFilters ? resetGraphFilters : undefined}
        />
      )}
    </div>
  )
}

const GraphPage = React.memo(GraphPageComponent)
export default GraphPage
