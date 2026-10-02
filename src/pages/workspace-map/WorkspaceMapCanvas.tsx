import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
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
import { getGraphNodeOpenPath } from '@/logic/graphViewModel'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { getMiniMapNodeColor, shouldRenderGraphMiniMap } from '@/pages/graph/graphMiniMap'
import { WorkspaceMapFileNode } from '@/pages/workspace-map/WorkspaceMapFileNode'
import { WorkspaceMapReferenceNode } from '@/pages/workspace-map/WorkspaceMapReferenceNode'
import { WorkspaceMapState } from '@/pages/workspace-map/WorkspaceMapState'
import { useWorkspaceMapLayout } from '@/pages/workspace-map/useWorkspaceMapLayout'

const nodeTypes: NodeTypes = {
  external: WorkspaceMapReferenceNode,
  file: WorkspaceMapFileNode,
  missing: WorkspaceMapReferenceNode,
  preview: WorkspaceMapReferenceNode,
}

const getWorkspaceMapNodeOpenPath = (node: Node<GraphNodeData>) => {
  const path = node.data.path
  if (node.type === 'file' && path && isMarkdownFilePath(path)) return path
  return getGraphNodeOpenPath(node) ?? null
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
    () =>
      graph.nodes.map((node) => {
        const editorActive = node.type === 'file' && node.data.path === activePath
        const openPath = getWorkspaceMapNodeOpenPath(node)
        return {
          ...node,
          ariaLabel: node.data.label,
          ariaRole: openPath ? ('button' as const) : ('group' as const),
          focusable: Boolean(openPath) && !editorActive,
        }
      }),
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
      const openPath = getGraphNodeOpenPath(node)
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
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const handleCanvasKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!(event.target instanceof HTMLElement)) return
      if (event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) {
        return
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        void flow?.zoomIn({ duration: 0 })
        return
      }
      if (event.key === '-') {
        event.preventDefault()
        void flow?.zoomOut({ duration: 0 })
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        void flow?.fitView({ duration: 0, maxZoom: 1, padding: 0.22 })
        return
      }
      if (event.key !== 'Enter' && event.key !== ' ') return
      const nodeElement = event.target.closest<HTMLElement>('.react-flow__node')
      if (!nodeElement || event.target !== nodeElement) return
      const node = nodesById.get(nodeElement.dataset.id ?? '')
      if (!node || !getWorkspaceMapNodeOpenPath(node)) return
      event.preventDefault()
      activateNode(node)
    },
    [activateNode, flow, nodesById],
  )
  const handleNodeDoubleClick = useCallback(
    (event: MouseEvent, node: Node<GraphNodeData>) => {
      event.preventDefault()
      if (node.type === 'file' && node.data.path && isMarkdownFilePath(node.data.path)) return
      const path = getGraphNodeOpenPath(node)
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
      nodesDraggable={false}
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
