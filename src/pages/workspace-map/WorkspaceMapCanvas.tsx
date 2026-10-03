import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
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
import { getMiniMapNodeColor, shouldRenderGraphMiniMap } from '@/pages/graph/graphMiniMap'
import { WorkspaceMapFileNode } from '@/pages/workspace-map/WorkspaceMapFileNode'
import { WorkspaceMapReferenceNode } from '@/pages/workspace-map/WorkspaceMapReferenceNode'
import { WorkspaceMapState } from '@/pages/workspace-map/WorkspaceMapState'
import { useWorkspaceMapLayout } from '@/pages/workspace-map/useWorkspaceMapLayout'
import { useWorkspaceMapKeyboard } from '@/pages/workspace-map/useWorkspaceMapKeyboard'
import {
  getWorkspaceMapNodeOpenPath,
  presentWorkspaceMapNode,
} from '@/pages/workspace-map/workspaceMapNodePresentation'

const nodeTypes: NodeTypes = {
  external: WorkspaceMapReferenceNode,
  file: WorkspaceMapFileNode,
  missing: WorkspaceMapReferenceNode,
  preview: WorkspaceMapReferenceNode,
}
type WorkspaceMapCanvasProps = {
  activePath: string | null
  editorLoadState: WorkspaceMapEditorLoadState
  graph: GraphData
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
  const baseNodes = useMemo(
    () => graph.nodes.map((node) => presentWorkspaceMapNode(node, activePath)),
    [activePath, graph.nodes],
  )
  const presentedGraph = useMemo<GraphData>(() => {
    const activeIndex = baseNodes.findIndex(
      (node) => node.type === 'file' && node.data.path === activePath,
    )
    const nodes = baseNodes.slice()
    const activeNode = nodes[activeIndex]
    const path = activeNode?.data.path
    if (activeNode && path) {
      nodes[activeIndex] = {
        ...activeNode,
        data: {
          ...activeNode.data,
          workspaceMapEditor: {
            active: true as const,
            loadState: editorLoadState,
            onChange,
            onClose: onCloseEditor,
            onOpenFull: () => onOpenFile(path),
            onRetry: onRetryEditor,
            readOnly,
          },
        },
      }
    }
    return { edges: graph.edges, layoutKey: graph.layoutKey ?? 'workspace-map', nodes }
  }, [
    activePath,
    editorLoadState,
    baseNodes,
    graph.edges,
    graph.layoutKey,
    onChange,
    onCloseEditor,
    onOpenFile,
    onRetryEditor,
    readOnly,
  ])
  const [nodes, setNodes, onNodesChange] = useNodesState(presentedGraph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(presentedGraph.edges)
  const layoutFlow = useMemo(
    () =>
      flow
        ? {
            fitView: (options?: Parameters<typeof flow.fitView>[0]) =>
              flow.fitView({ ...options, maxZoom: Math.min(options?.maxZoom ?? 1, 1) }),
          }
        : null,
    [flow],
  )
  const layout = useWorkspaceMapLayout({
    activePath: null,
    flow: layoutFlow,
    graph: presentedGraph,
    setNodes,
  })
  useEffect(() => {
    if (!flow || layout.status !== 'ready') return
    let frame = 0
    const handleResize = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        void flow.fitView({ duration: 0, maxZoom: 1, padding: 0.22 })
      })
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.cancelAnimationFrame(frame)
    }
  }, [flow, layout.status])

  useEffect(() => {
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]))
      return presentedGraph.nodes.map((node) => {
        const existing = currentById.get(node.id)
        if (existing?.data === node.data && existing.type === node.type) return existing
        return existing
          ? { ...node, position: existing.position, measured: existing.measured }
          : node
      })
    })
  }, [presentedGraph.nodes, setNodes])
  useEffect(() => setEdges(presentedGraph.edges), [presentedGraph.edges, setEdges])

  const activateNode = useCallback(
    (node: Node<GraphNodeData>) => {
      const path = node.data.path
      if (node.type === 'file' && path && isMarkdownFilePath(path)) {
        onActivateEditor(path)
        return
      }
      const openPath = getWorkspaceMapNodeOpenPath(node)
      if (openPath) onOpenFile(openPath)
    },
    [onActivateEditor, onOpenFile],
  )

  const handleNodeClick = useCallback(
    (_event: MouseEvent, node: Node<GraphNodeData>) => {
      if (node.type === 'file' && node.data.path && isMarkdownFilePath(node.data.path)) {
        activateNode(node)
      }
    },
    [activateNode],
  )
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
      if (node.type === 'file' && node.data.path && isMarkdownFilePath(node.data.path)) return
      const path = getWorkspaceMapNodeOpenPath(node)
      if (path) onOpenFile(path)
    },
    [onOpenFile],
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
    <ReactFlow<Node<GraphNodeData>, Edge>
      aria-label={t('workspaceMap.canvas')}
      tabIndex={0}
      colorMode={darkMode ? 'dark' : 'light'}
      className={cn('workspace-map-canvas h-full w-full', activePath && 'is-editing')}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onInit={setFlow}
      onKeyDown={handleCanvasKeyDown}
      onNodeClick={handleNodeClick}
      onNodeDoubleClick={handleNodeDoubleClick}
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
      minZoom={0.15}
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
        fitViewOptions={{ maxZoom: 1, padding: 0.22 }}
      />
      {shouldRenderGraphMiniMap(showMiniMap, nodes.length) ? (
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          className="!bg-card/90"
          nodeColor={getMiniMapNodeColor}
        />
      ) : null}
    </ReactFlow>
  )
}
