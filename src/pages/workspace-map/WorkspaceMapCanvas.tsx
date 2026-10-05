import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import type { Edge, Node, NodeTypes, ReactFlowInstance } from '@xyflow/react'
import { isMarkdownFilePath } from '@/logic/fileTypes'
import type { GraphData, GraphNodeData, WorkspaceMapEditorLoadState } from '@/logic/graph'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { GraphMiniMap, workspaceMiniMapOffsets } from '@/pages/graph/GraphMiniMapView'
import { WorkspaceMapFileNode } from '@/pages/workspace-map/WorkspaceMapFileNode'
import { WorkspaceMapReferenceNode } from '@/pages/workspace-map/WorkspaceMapReferenceNode'
import { WorkspaceMapState } from '@/pages/workspace-map/WorkspaceMapState'
import { WorkspaceMapToolbar } from '@/pages/workspace-map/WorkspaceMapToolbar'
import { useWorkspaceMapLayout } from '@/pages/workspace-map/useWorkspaceMapLayout'
import { useWorkspaceMapKeyboard } from '@/pages/workspace-map/useWorkspaceMapKeyboard'
import { useWorkspaceMapNodeDisclosure } from '@/pages/workspace-map/useWorkspaceMapNodeDisclosure'
import { useWorkspaceMapNeighborhood } from '@/pages/workspace-map/useWorkspaceMapNeighborhood'
import { useWorkspaceMapPresentedGraph } from '@/pages/workspace-map/useWorkspaceMapPresentedGraph'
import { presentWorkspaceMapNeighborhoodNodes } from '@/pages/workspace-map/workspaceMapNeighborhood'
import {
  getWorkspaceMapNodeOpenPath,
  mergeWorkspaceMapNodeGeometry,
} from '@/pages/workspace-map/workspaceMapNodePresentation'
import { getWorkspaceMapInitialFocusPath } from '@/pages/workspace-map/workspaceMapViewModel'

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

export const WorkspaceMapCanvas = ({
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
  const [flow, setFlow] = useState<ReactFlowInstance<Node<GraphNodeData>, Edge> | null>(null)
  const [externalState, setExternalState] = useState({
    graphIdentity,
    showExternalResources: false,
  })
  const showExternalResources =
    externalState.graphIdentity === graphIdentity && externalState.showExternalResources
  const { compact, presentedGraph, renderedGraph, totalExternalCount, webViews } =
    useWorkspaceMapPresentedGraph({
      activePath,
      editorLoadState,
      graph,
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
          }
        : null,
    [flow],
  )
  const initialFocusPath = useMemo(
    () => getWorkspaceMapInitialFocusPath(renderedGraph),
    [renderedGraph],
  )
  const layout = useWorkspaceMapLayout({
    activePath: activePath ?? initialFocusPath,
    flow: layoutFlow,
    graph: renderedGraph,
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
  const focusNode = useCallback(
    (node: Node<GraphNodeData>) => {
      if (!flow) return
      focusNeighborhoodNode(node.id)
      void flow.fitView({
        duration: 0,
        maxZoom: 1,
        minZoom: 0.35,
        nodes: [node],
        padding: 0.32,
      })
    },
    [flow, focusNeighborhoodNode],
  )
  const activateNode = useCallback(
    (node: Node<GraphNodeData>) => {
      if (node.type === 'external' && node.data.url) {
        webViews.activate(node.id)
        return
      }
      const path = node.data.path
      if (node.type === 'file' && path && isMarkdownFilePath(path)) {
        onActivateEditor(path)
        return
      }
      const openPath = getWorkspaceMapNodeOpenPath(node)
      if (openPath) onOpenFile(openPath)
    },
    [onActivateEditor, onOpenFile, webViews],
  )
  const handleNodeClick = useCallback(
    (_event: MouseEvent, node: Node<GraphNodeData>) => {
      if (node.type === 'file' && node.data.path && isMarkdownFilePath(node.data.path)) {
        activateNode(node)
      }
    },
    [activateNode],
  )
  const handlePaneClick = useCallback(() => {
    clearNeighborhood()
    webViews.deactivate()
  }, [clearNeighborhood, webViews])
  const handleCanvasKeyDown = useWorkspaceMapKeyboard({
    activePath,
    activateNode,
    flow,
    nodes,
    onCloseEditor,
  })
  const handleNodeDoubleClick = useCallback(
    (event: MouseEvent, node: Node<GraphNodeData>) => {
      event.preventDefault()
      if (node.type === 'external' && node.data.url) {
        webViews.activate(node.id)
        return
      }
      if (node.type === 'file' && node.data.path && isMarkdownFilePath(node.data.path)) return
      const path = getWorkspaceMapNodeOpenPath(node)
      if (path) onOpenFile(path)
    },
    [onOpenFile, webViews],
  )

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
    <div className="relative h-full w-full">
      <ReactFlow<Node<GraphNodeData>, Edge>
        aria-label={t('workspaceMap.canvas')}
        tabIndex={0}
        colorMode={darkMode ? 'dark' : 'light'}
        className={cn('workspace-map-canvas h-full w-full', activePath && 'is-editing')}
        nodes={disclosedNodes}
        edges={presentedEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={setFlow}
        onKeyDown={handleCanvasKeyDown}
        onBlurCapture={onBlurCapture}
        onFocusCapture={onFocusCapture}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onPaneClick={handlePaneClick}
        nodesDraggable
        nodesConnectable={false}
        nodesFocusable
        elementsSelectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        panOnDrag
        zoomOnScroll
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
        nodes={disclosedNodes}
        onFocusNode={focusNode}
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
