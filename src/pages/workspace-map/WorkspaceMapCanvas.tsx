import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import type { Edge, Node, NodeTypes, ReactFlowInstance } from '@xyflow/react'
import type { GraphData, GraphNodeData, WorkspaceMapEditorLoadState } from '@/logic/graph'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { GraphMiniMap, workspaceMiniMapOffsets } from '@/pages/graph/GraphMiniMapView'
import { WorkspaceMapFileNode } from '@/pages/workspace-map/WorkspaceMapFileNode'
import { WorkspaceMapGroupRegions } from '@/pages/workspace-map/WorkspaceMapGroupRegions'
import { WorkspaceMapReferenceNode } from '@/pages/workspace-map/WorkspaceMapReferenceNode'
import { WorkspaceMapState } from '@/pages/workspace-map/WorkspaceMapState'
import { WorkspaceMapToolbar } from '@/pages/workspace-map/WorkspaceMapToolbar'
import { useWorkspaceMapLayout } from '@/pages/workspace-map/useWorkspaceMapLayout'
import { useWorkspaceMapCanvasPersistence } from '@/pages/workspace-map/useWorkspaceMapCanvasPersistence'
import { useWorkspaceMapInteractions } from '@/pages/workspace-map/useWorkspaceMapInteractions'
import { useWorkspaceMapNodeDisclosure } from '@/pages/workspace-map/useWorkspaceMapNodeDisclosure'
import { useWorkspaceMapNeighborhood } from '@/pages/workspace-map/useWorkspaceMapNeighborhood'
import { useWorkspaceMapPresentedGraph } from '@/pages/workspace-map/useWorkspaceMapPresentedGraph'
import { presentWorkspaceMapNeighborhoodNodes } from '@/pages/workspace-map/workspaceMapNeighborhood'
import { mergeWorkspaceMapNodeGeometry } from '@/pages/workspace-map/workspaceMapNodePresentation'
import { getWorkspaceMapInitialFocusPath } from '@/pages/workspace-map/workspaceMapViewModel'
import type { WorkspaceMapMode } from '@/pages/workspace-map/workspaceMapMode'
import { notifyAnimatedCursorViewport } from '@/components/plate/animatedCursorViewport'

const nodeTypes: NodeTypes = {
  external: WorkspaceMapReferenceNode,
  file: WorkspaceMapFileNode,
  missing: WorkspaceMapReferenceNode,
  preview: WorkspaceMapReferenceNode,
}
const workspaceMapToolbarAwareMiniMapOffsets = {
  ...workspaceMiniMapOffsets,
  'top-left': { marginTop: 52 },
}
type WorkspaceMapCanvasProps = {
  activePath: string | null
  editorLoadState: WorkspaceMapEditorLoadState
  graph: GraphData
  graphIdentity: string
  onActivateEditor: (path: string) => void
  onChange: (value: string) => void
  onCloseEditor: () => void
  onOpenFile: (path: string) => void
  onRetryEditor: () => void
  readOnly: boolean
  showMiniMap: boolean
}

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
  const canvasRef = useRef<HTMLDivElement>(null)
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
      graph,
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
  const persistence = useWorkspaceMapCanvasPersistence({
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
  const interactions = useWorkspaceMapInteractions({
    activePath,
    clearNeighborhood,
    flow,
    focusNeighborhoodNode,
    nodes,
    onActivateEditor,
    onCloseEditor,
    onOpenFile,
    webViews,
  })
  const handleViewportMove = useCallback(() => {
    notifyAnimatedCursorViewport(canvasRef.current)
  }, [])

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
    <div className="relative h-full w-full" data-marklab-cursor-viewport ref={canvasRef}>
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
        edges={presentedEdges}
        nodeTypes={nodeTypes}
        onNodesChange={persistence.handleNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={setFlow}
        onKeyDown={interactions.onKeyDown}
        onBlurCapture={onBlurCapture}
        onFocusCapture={onFocusCapture}
        onNodeClick={interactions.onNodeClick}
        onNodeDoubleClick={interactions.onNodeDoubleClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onMove={handleViewportMove}
        onMoveEnd={() => persistence.scheduleViewportSave()}
        onPaneClick={interactions.onPaneClick}
        nodesDraggable
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
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="hsl(var(--muted-foreground) / 0.22)"
        />
        {mode === 'overview' ? <WorkspaceMapGroupRegions nodes={disclosedNodes} /> : null}
        <Controls
          position="bottom-right"
          showInteractive={false}
          fitViewOptions={{ maxZoom: 1, minZoom: 0.35, padding: 0.22 }}
        />
        <GraphMiniMap
          nodeCount={nodes.length}
          offsets={workspaceMapToolbarAwareMiniMapOffsets}
          show={showMiniMap}
        />
      </ReactFlow>
      <WorkspaceMapToolbar
        externalCount={totalExternalCount}
        mode={mode}
        nodes={disclosedNodes}
        onArrange={layout.arrange}
        onFocusNode={interactions.focusNode}
        onModeChange={(nextMode) => setModeState({ graphIdentity, mode: nextMode })}
        onToggleExternalResources={() =>
          setExternalState((current) => ({
            graphIdentity,
            showExternalResources:
              current.graphIdentity === graphIdentity ? !current.showExternalResources : true,
          }))
        }
        showExternalResources={showExternalResources}
      />
    </div>
  )
}
