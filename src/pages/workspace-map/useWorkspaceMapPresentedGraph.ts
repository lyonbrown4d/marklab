import { useMemo } from 'react'
import type { Node } from '@xyflow/react'
import { useGraphRenderedNodes } from '@/pages/graph/useGraphWebViewState'
import type { GraphData, GraphNodeData, WorkspaceMapEditorLoadState } from '@/logic/graph'
import { presentWorkspaceMapNode } from '@/pages/workspace-map/workspaceMapNodePresentation'
import {
  applyWorkspaceMapCompactGeometry,
  createWorkspaceMapViewGraph,
  shouldCompactWorkspaceMap,
} from '@/pages/workspace-map/workspaceMapViewModel'
import type { WorkspaceMapMode } from '@/pages/workspace-map/workspaceMapMode'

type Options = {
  activePath: string | null
  editorLoadState: WorkspaceMapEditorLoadState
  graph: GraphData
  searchNodes?: Node<GraphNodeData>[]
  mode: WorkspaceMapMode
  onChange: (value: string) => void
  onCloseEditor: () => void
  onOpenFile: (path: string) => void
  onRetryEditor: () => void
  readOnly: boolean
  showExternalResources: boolean
}

export const useWorkspaceMapPresentedGraph = ({
  activePath,
  editorLoadState,
  graph,
  searchNodes,
  mode,
  onChange,
  onCloseEditor,
  onOpenFile,
  onRetryEditor,
  readOnly,
  showExternalResources,
}: Options) => {
  const { graph: viewGraph, totalExternalCount } = useMemo(
    () => createWorkspaceMapViewGraph(graph, showExternalResources),
    [graph, showExternalResources],
  )
  const compact = useMemo(() => shouldCompactWorkspaceMap(viewGraph.nodes), [viewGraph.nodes])
  const presentNodes = useMemo(() => {
    let cache = new Map<Node<GraphNodeData>, Node<GraphNodeData>>()
    return (nodes: Node<GraphNodeData>[]) => {
      const nextCache = new Map<Node<GraphNodeData>, Node<GraphNodeData>>()
      const presentedNodes = nodes.map((node) => {
        const cached = cache.get(node)
        if (cached) {
          nextCache.set(node, cached)
          return cached
        }
        const presented = presentWorkspaceMapNode(node, activePath)
        const result = applyWorkspaceMapCompactGeometry(
          { ...presented, data: { ...presented.data, workspaceMapMode: mode } },
          compact,
          activePath,
        )
        nextCache.set(node, result)
        return result
      })
      cache = nextCache
      return presentedNodes
    }
  }, [activePath, compact, mode])
  const baseNodes = useMemo(() => presentNodes(viewGraph.nodes), [presentNodes, viewGraph.nodes])
  const presentedEdges = useMemo(
    () =>
      viewGraph.edges.map((edge) => ({
        ...edge,
        type: mode === 'overview' ? 'default' : 'smoothstep',
      })),
    [mode, viewGraph.edges],
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
    return { edges: presentedEdges, layoutKey: viewGraph.layoutKey ?? 'workspace-map', nodes }
  }, [
    activePath,
    baseNodes,
    editorLoadState,
    onChange,
    onCloseEditor,
    onOpenFile,
    onRetryEditor,
    readOnly,
    presentedEdges,
    viewGraph.layoutKey,
  ])
  const webViews = useGraphRenderedNodes(presentedGraph.nodes, presentedGraph.layoutKey)
  const renderedGraph = useMemo<GraphData>(
    () => ({ ...presentedGraph, nodes: webViews.renderedNodes }),
    [presentedGraph, webViews.renderedNodes],
  )

  const searchableNodes = useMemo(() => {
    const candidates = searchNodes ?? renderedGraph.nodes
    return showExternalResources
      ? candidates
      : candidates.filter((node) => node.type !== 'external')
  }, [searchNodes, renderedGraph.nodes, showExternalResources])
  return { compact, presentedGraph, renderedGraph, searchableNodes, totalExternalCount, webViews }
}
