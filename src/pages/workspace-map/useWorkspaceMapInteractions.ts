import { useCallback, type MouseEvent } from 'react'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import { isMarkdownFilePath } from '@/logic/fileTypes'
import type { GraphNodeData } from '@/logic/graph'
import { useWorkspaceMapKeyboard } from '@/pages/workspace-map/useWorkspaceMapKeyboard'
import { getWorkspaceMapNodeOpenPath } from '@/pages/workspace-map/workspaceMapNodePresentation'

type WorkspaceMapInteractionsOptions = {
  activePath: string | null
  clearNeighborhood: () => void
  flow: ReactFlowInstance<Node<GraphNodeData>, Edge> | null
  focusNeighborhoodNode: (nodeId: string) => void
  nodes: Node<GraphNodeData>[]
  onActivateEditor: (path: string) => void
  onCloseEditor: () => void
  onOpenFile: (path: string) => void
  webViews: { activate: (nodeId: string) => void; deactivate: () => void }
}

export const useWorkspaceMapInteractions = ({
  activePath,
  clearNeighborhood,
  flow,
  focusNeighborhoodNode,
  nodes,
  onActivateEditor,
  onCloseEditor,
  onOpenFile,
  webViews,
}: WorkspaceMapInteractionsOptions) => {
  const focusNode = useCallback(
    (node: Node<GraphNodeData>) => {
      if (!flow) return
      focusNeighborhoodNode(node.id)
      void flow.fitView({ duration: 0, maxZoom: 1, minZoom: 0.35, nodes: [node], padding: 0.32 })
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
  const onNodeClick = useCallback(
    (_event: MouseEvent, node: Node<GraphNodeData>) => {
      if (node.type === 'file' && node.data.path && isMarkdownFilePath(node.data.path)) {
        activateNode(node)
      }
    },
    [activateNode],
  )
  const onNodeDoubleClick = useCallback(
    (event: MouseEvent, node: Node<GraphNodeData>) => {
      event.preventDefault()
      if (node.type === 'file' && node.data.path && isMarkdownFilePath(node.data.path)) return
      activateNode(node)
    },
    [activateNode],
  )
  const onPaneClick = useCallback(() => {
    clearNeighborhood()
    webViews.deactivate()
  }, [clearNeighborhood, webViews])
  const onKeyDown = useWorkspaceMapKeyboard({
    activePath,
    activateNode,
    flow,
    nodes,
    onCloseEditor,
  })

  return { focusNode, onKeyDown, onNodeClick, onNodeDoubleClick, onPaneClick }
}
