import { useMemo } from 'react'
import { useGraphRenderedNodes } from '@/pages/graph/useGraphWebViewState'
import type { GraphData, WorkspaceMapEditorLoadState } from '@/logic/graph'
import { presentWorkspaceMapNode } from '@/pages/workspace-map/workspaceMapNodePresentation'
import {
  applyWorkspaceMapCompactGeometry,
  createWorkspaceMapViewGraph,
  shouldCompactWorkspaceMap,
} from '@/pages/workspace-map/workspaceMapViewModel'

type Options = {
  activePath: string | null
  editorLoadState: WorkspaceMapEditorLoadState
  graph: GraphData
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
  const baseNodes = useMemo(
    () =>
      viewGraph.nodes.map((node) =>
        applyWorkspaceMapCompactGeometry(
          presentWorkspaceMapNode(node, activePath),
          compact,
          activePath,
        ),
      ),
    [activePath, compact, viewGraph.nodes],
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
    return { edges: viewGraph.edges, layoutKey: viewGraph.layoutKey ?? 'workspace-map', nodes }
  }, [
    activePath,
    baseNodes,
    editorLoadState,
    onChange,
    onCloseEditor,
    onOpenFile,
    onRetryEditor,
    readOnly,
    viewGraph.edges,
    viewGraph.layoutKey,
  ])
  const webViews = useGraphRenderedNodes(presentedGraph.nodes, presentedGraph.layoutKey)
  const renderedGraph = useMemo<GraphData>(
    () => ({ ...presentedGraph, nodes: webViews.renderedNodes }),
    [presentedGraph, webViews.renderedNodes],
  )

  return { compact, presentedGraph, renderedGraph, totalExternalCount, webViews }
}
