import type { Node } from '@xyflow/react'
import { isMarkdownFilePath } from '@/logic/fileTypes'
import type { GraphNodeData } from '@/logic/graph'
import { getGraphNodeOpenPath } from '@/logic/graphViewModel'

export const WORKSPACE_MAP_RESOURCE_DRAG_HANDLE_CLASS = 'workspace-map-resource-drag-handle'
const EMBEDDED_PREVIEW_DRAG_HANDLE_CLASS = 'embedded-preview-drag-handle'
const WEB_PREVIEW_DRAG_HANDLE_CLASS = 'workspace-map-web-drag-handle'

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
  const resourceNode = node.type === 'file' || node.type === 'preview'
  const resourcePreview = node.type === 'preview' && Boolean(node.data.previewKind)
  const webPreview = node.type === 'external' && Boolean(node.data.url)
  const openPath = getWorkspaceMapNodeOpenPath(node)
  return {
    ...node,
    ariaLabel: node.data.label,
    ariaRole: resourcePreview ? 'group' : openPath ? 'button' : 'group',
    dragHandle: resourcePreview
      ? `.${EMBEDDED_PREVIEW_DRAG_HANDLE_CLASS}`
      : webPreview
        ? `.${WEB_PREVIEW_DRAG_HANDLE_CLASS}`
        : resourceNode
          ? `.${WORKSPACE_MAP_RESOURCE_DRAG_HANDLE_CLASS}`
          : undefined,
    draggable: !editorActive,
    focusable: !resourcePreview && Boolean(openPath) && !editorActive,
    zIndex: editorActive ? 10 : node.zIndex,
  }
}

export const mergeWorkspaceMapNodeGeometry = (
  incoming: Node<GraphNodeData>,
  current: Node<GraphNodeData>,
): Node<GraphNodeData> => ({
  ...incoming,
  height: current.height ?? incoming.height,
  measured: current.measured,
  position: current.position,
  style: current.style ? { ...incoming.style, ...current.style } : incoming.style,
  width: current.width ?? incoming.width,
})
