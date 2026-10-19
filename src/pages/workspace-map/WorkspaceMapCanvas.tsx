import { useCallback, useEffect, useMemo, useState } from 'react'
import { PanOnScrollMode, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react'
import { useKeepAliveContext } from 'keepalive-for-react'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { WorkspaceMapFlowLayers } from '@/pages/workspace-map/WorkspaceMapFlowLayers'
import { WorkspaceMapState } from '@/pages/workspace-map/WorkspaceMapState'
import { WorkspaceMapToolbar } from '@/pages/workspace-map/WorkspaceMapToolbar'
import { useWorkspaceMapLayout } from '@/pages/workspace-map/useWorkspaceMapLayout'
import { useWorkspaceMapCanvasPersistence } from '@/pages/workspace-map/useWorkspaceMapCanvasPersistence'
import { useWorkspaceMapInteractions } from '@/pages/workspace-map/useWorkspaceMapInteractions'
import { useWorkspaceMapNodeDisclosure } from '@/pages/workspace-map/useWorkspaceMapNodeDisclosure'
import { useWorkspaceMapNeighborhood } from '@/pages/workspace-map/useWorkspaceMapNeighborhood'
import { useWorkspaceMapPresentedGraph } from '@/pages/workspace-map/useWorkspaceMapPresentedGraph'
import { useWorkspaceMapNodeDetails } from '@/pages/workspace-map/useWorkspaceMapNodeDetails'
import { useWorkspaceMapViewNavigation } from '@/pages/workspace-map/useWorkspaceMapViewNavigation'
import { presentWorkspaceMapNeighborhoodNodes } from '@/pages/workspace-map/workspaceMapNeighborhood'
import { mergeWorkspaceMapNodeGeometry } from '@/pages/workspace-map/workspaceMapNodePresentation'
import { getWorkspaceMapInitialFocusPath } from '@/pages/workspace-map/workspaceMapViewModel'
import { workspaceMapNodeTypes } from '@/pages/workspace-map/workspaceMapCanvasConfig'
import type { WorkspaceMapMode } from '@/pages/workspace-map/workspaceMapMode'
import type { WorkspaceMapCanvasProps } from '@/pages/workspace-map/workspaceMapCanvasTypes'
import { useWorkspaceMapViewport } from '@/pages/workspace-map/useWorkspaceMapViewport'
import { useWorkspaceMapNavigationRequests } from '@/pages/workspace-map/useWorkspaceMapNavigationRequests'
import { hideWorkspaceMapOverviewEdges } from '@/pages/workspace-map/workspaceMapOverviewEdgeGeometry'

const FLOW_PRO_OPTIONS = { hideAttribution: true }

export const WorkspaceMapCanvas = (props: WorkspaceMapCanvasProps) => (
  <WorkspaceMapCanvasContent key={props.graphIdentity} {...props} />
)

const WorkspaceMapCanvasContent = ({
  activePath,
  editorLoadState,
  graph,
  graphIdentity,
  onActivateEditor,
  onChange,
  onCloseEditor,
  onOpenFile,
  onRetryEditor,
  readOnly,
  showMiniMap,
}: WorkspaceMapCanvasProps) => {
  const darkMode = useDarkMode()
  const { t } = useI18n()
  const routeCache = useKeepAliveContext()
  const routeActive = !routeCache.cacheKey || routeCache.active
  const { bindElement, element, lod, onMove, revision, settle } = useWorkspaceMapViewport()
  const [searchOpen, setSearchOpen] = useState(false)
  const graphWithDetails = useWorkspaceMapNodeDetails({
    active: routeActive,
    activePath,
    container: element,
    graph,
    graphIdentity,
    viewportRevision: revision,
  })
  const [flow, setFlow] = useState<ReactFlowInstance<Node<GraphNodeData>, Edge> | null>(null)
  const [externalState, setExternalState] = useState({
    graphIdentity,
    showExternalResources: false,
  })
  const showExternalResources =
    externalState.graphIdentity === graphIdentity && externalState.showExternalResources
  const [modeState, setModeState] = useState<{ graphIdentity: string; mode: WorkspaceMapMode }>({
    graphIdentity,
    mode: 'overview',
  })
  const mode = modeState.graphIdentity === graphIdentity ? modeState.mode : 'overview'
  const { compact, presentedGraph, renderedGraph, totalExternalCount, webViews } =
    useWorkspaceMapPresentedGraph({
      activePath,
      editorLoadState,
      graph: graphWithDetails,
      mode,
      onChange,
      onCloseEditor,
      onOpenFile,
      onRetryEditor,
      readOnly,
      showExternalResources,
    })
  const [nodes, setNodes, onNodesChange] = useNodesState(renderedGraph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(presentedGraph.edges)
  const {
    clear: clearNeighborhood,
    focusNode: focusNeighborhoodNode,
    neighborhood,
    onBlurCapture,
    onFocusCapture,
    onNodeMouseEnter,
    onNodeMouseLeave,
    presentedEdges,
  } = useWorkspaceMapNeighborhood({
    activePath,
    baseEdges: presentedGraph.edges,
    edges,
    nodes: renderedGraph.nodes,
  })
  const flowEdges = useMemo(
    () => (mode === 'overview' ? hideWorkspaceMapOverviewEdges(presentedEdges) : presentedEdges),
    [mode, presentedEdges],
  )
  const { nodes: disclosedNodes } = useWorkspaceMapNodeDisclosure({
    activePath,
    defaultCollapsed: compact,
    graphIdentity,
    nodes,
    setNodes,
  })
  const layoutFlow = useMemo(
    () =>
      flow
        ? {
            fitView: (options?: Parameters<typeof flow.fitView>[0]) =>
              flow.fitView({
                ...options,
                maxZoom: Math.min(options?.maxZoom ?? 1, 1),
                minZoom: Math.max(options?.minZoom ?? 0.35, 0.35),
              }),
            setViewport: flow.setViewport,
          }
        : null,
    [flow],
  )
  const initialFocusPath = useMemo(
    () => getWorkspaceMapInitialFocusPath(renderedGraph),
    [renderedGraph],
  )
  const layout = useWorkspaceMapLayout({
    activePath,
    flow: layoutFlow,
    focusPath: activePath ?? initialFocusPath,
    graph: renderedGraph,
    mode,
    nodes,
    setNodes,
  })
  const { handleNodesChange, scheduleViewportSave } = useWorkspaceMapCanvasPersistence({
    disclosedNodes,
    enabled: layout.status === 'ready',
    flow,
    nodes,
    onNodesChange,
    request: layout.persistenceRequest,
    setNodes,
  })
  useEffect(() => {
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]))
      const mergedNodes = renderedGraph.nodes.map((node) => {
        const existing = currentById.get(node.id)
        if (existing?.data === node.data && existing.type === node.type) return existing
        return existing ? mergeWorkspaceMapNodeGeometry(node, existing) : node
      })
      return presentWorkspaceMapNeighborhoodNodes(mergedNodes, neighborhood)
    })
  }, [neighborhood, renderedGraph.nodes, setNodes])
  useEffect(() => setEdges(presentedGraph.edges), [presentedGraph.edges, setEdges])
  const handleModeChange = useCallback(
    (nextMode: WorkspaceMapMode) => setModeState({ graphIdentity, mode: nextMode }),
    [graphIdentity],
  )
  const viewNavigation = useWorkspaceMapViewNavigation({
    active: routeActive,
    clearNeighborhood,
    flow,
    focusNeighborhoodNode,
    graphIdentity,
  })
  useWorkspaceMapNavigationRequests({
    active: routeActive,
    flow,
    fitWorkspace: viewNavigation.fitWorkspace,
    focusNeighborhoodNode,
    focusNode: viewNavigation.focusNode,
    nodes,
    workspaceKey: graphIdentity,
  })
  const handleOpenSearch = useCallback(() => setSearchOpen(true), [])
  const handleToggleExternalResources = useCallback(() => {
    setExternalState((current) => ({
      graphIdentity,
      showExternalResources:
        current.graphIdentity === graphIdentity ? !current.showExternalResources : true,
    }))
  }, [graphIdentity])
  const interactions = useWorkspaceMapInteractions({
    activePath,
    clearNeighborhood,
    exitFocusedView: viewNavigation.exitFocus,
    fitWorkspace: viewNavigation.fitWorkspace,
    flow,
    focusNode: viewNavigation.focusNode,
    mode,
    nodes,
    onActivateEditor,
    onCloseEditor,
    onOpenFile,
    onModeChange: handleModeChange,
    onOpenSearch: handleOpenSearch,
    webViews,
  })
  const handleViewportMoveEnd = useCallback(() => {
    scheduleViewportSave()
    settle()
  }, [scheduleViewportSave, settle])

  if (layout.status === 'loading') {
    return <WorkspaceMapState label={t('workspaceMap.loadingDocument')} loading />
  }
  if (layout.status === 'error') {
    return (
      <WorkspaceMapState
        actionLabel={t('workspaceMap.retry')}
        label={t('workspaceMap.loadFailed')}
        onAction={layout.retry}
      />
    )
  }

  return (
    <div
      className="relative h-full w-full"
      data-marklab-cursor-viewport
      data-viewport-lod={lod}
      ref={bindElement}
    >
      <ReactFlow<Node<GraphNodeData>, Edge>
        aria-label={t('workspaceMap.canvas')}
        tabIndex={0}
        colorMode={darkMode ? 'dark' : 'light'}
        className={cn(
          'workspace-map-canvas h-full w-full',
          mode === 'overview' && 'is-overview',
          activePath && 'is-editing',
        )}
        nodes={disclosedNodes}
        edges={flowEdges}
        nodeTypes={workspaceMapNodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={setFlow}
        onKeyDown={interactions.onKeyDown}
        onBlurCapture={onBlurCapture}
        onFocusCapture={onFocusCapture}
        onNodeClick={interactions.onNodeClick}
        onNodeDoubleClick={interactions.onNodeDoubleClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onMove={onMove}
        onMoveEnd={handleViewportMoveEnd}
        onPaneClick={interactions.onPaneClick}
        onDoubleClick={interactions.onCanvasDoubleClick}
        nodesDraggable
        nodeDragThreshold={4}
        nodesConnectable={false}
        nodesFocusable
        elementsSelectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        panOnDrag
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        preventScrolling
        onlyRenderVisibleElements
        minZoom={0.35}
        maxZoom={2.2}
        proOptions={FLOW_PRO_OPTIONS}
      >
        <WorkspaceMapFlowLayers
          edges={presentedEdges}
          mode={mode}
          nodes={disclosedNodes}
          showMiniMap={showMiniMap}
        />
      </ReactFlow>
      <WorkspaceMapToolbar
        externalCount={totalExternalCount}
        mode={mode}
        nodes={renderedGraph.nodes}
        onArrange={layout.arrange}
        onFocusNode={interactions.focusNode}
        onModeChange={handleModeChange}
        onSearchOpenChange={setSearchOpen}
        onToggleExternalResources={handleToggleExternalResources}
        showExternalResources={showExternalResources}
        searchOpen={searchOpen}
      />
    </div>
  )
}
