import type { Node } from '@xyflow/react'
import { isMarkdownFilePath } from '@/logic/fileTypes'
import type { GraphNodeData } from '@/logic/graph'
import { getGraphNodeOpenPath } from '@/logic/graphViewModel'

export const WORKSPACE_MAP_PDF_DRAG_HANDLE_CLASS = 'workspace-map-pdf-drag-handle'

export const getWorkspaceMapNodeOpenPath = (node: Node<GraphNodeData>) => {
  const path = node.data.path
  if (node.type === 'file' && path && isMarkdownFilePath(path)) return path
  return getGraphNodeOpenPath(node) ?? null
}

export const presentWorkspaceMapNode = (
  node: Node<GraphNodeData>,
  activePath: string | null,
): Node<GraphNodeData> => {
  const editorActive = node.type === 'file' && node.data.path === activePath
  const pdfPreview = node.type === 'preview' && node.data.previewKind === 'pdf'
  const openPath = getWorkspaceMapNodeOpenPath(node)
  return {
    ...node,
    ariaLabel: node.data.label,
    ariaRole: pdfPreview ? 'group' : openPath ? 'button' : 'group',
    dragHandle: pdfPreview ? `.${WORKSPACE_MAP_PDF_DRAG_HANDLE_CLASS}` : undefined,
    draggable: !editorActive,
    focusable: !pdfPreview && Boolean(openPath) && !editorActive,
  }
}
