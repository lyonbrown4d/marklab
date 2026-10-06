import type { Node } from '@xyflow/react'
import { isMarkdownFilePath } from '@/logic/fileTypes'
import type { GraphNodeData } from '@/logic/graph'
import {
  WORKSPACE_MAP_COMPACT_NODE_HEIGHT,
  WORKSPACE_MAP_COMPACT_NODE_WIDTH,
  WORKSPACE_MAP_FILE_HEIGHT,
  WORKSPACE_MAP_FILE_WIDTH,
} from '@/logic/graphLayoutMetrics'
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
    ...(editorActive
      ? {
          height: WORKSPACE_MAP_FILE_HEIGHT,
          style: {
            ...node.style,
            height: WORKSPACE_MAP_FILE_HEIGHT,
            width: WORKSPACE_MAP_FILE_WIDTH,
          },
          width: WORKSPACE_MAP_FILE_WIDTH,
        }
      : {}),
    ariaLabel: node.data.label,
    ariaRole: resourcePreview ? 'group' : openPath ? 'button' : 'group',
    dragHandle: resourcePreview
      ? `.${EMBEDDED_PREVIEW_DRAG_HANDLE_CLASS}`
      : webPreview
        ? `.${WEB_PREVIEW_DRAG_HANDLE_CLASS}`
        : resourceNode
          ? `.${WORKSPACE_MAP_RESOURCE_DRAG_HANDLE_CLASS}`
          : undefined,
    draggable: !node.data.workspaceMapPinned,
    focusable: !resourcePreview && Boolean(openPath) && !editorActive,
    zIndex: editorActive ? 10 : node.zIndex,
  }
}

export const mergeWorkspaceMapNodeGeometry = (
  incoming: Node<GraphNodeData>,
  current: Node<GraphNodeData>,
): Node<GraphNodeData> => {
  const pinned = Boolean(current.data.workspaceMapPinned)
  const activatingEditor =
    Boolean(incoming.data.workspaceMapEditor) && !current.data.workspaceMapEditor
  const currentWidth = current.width ?? numericStyleDimension(current, 'width')
  const currentHeight = current.height ?? numericStyleDimension(current, 'height')
  const currentIsCompact =
    currentWidth === WORKSPACE_MAP_COMPACT_NODE_WIDTH &&
    currentHeight === WORKSPACE_MAP_COMPACT_NODE_HEIGHT
  const hasUserSizedGeometry = Boolean(currentWidth && currentHeight && !currentIsCompact)
  const preserveCurrentGeometry = !activatingEditor || hasUserSizedGeometry
  const persistedCollapsed = current.data.workspaceMapPersistedCollapsed
  const userModified = current.data.workspaceMapUserModified
  return {
    ...incoming,
    data: {
      ...incoming.data,
      ...(pinned ? { workspaceMapPinned: true } : {}),
      ...(typeof persistedCollapsed === 'boolean'
        ? { workspaceMapPersistedCollapsed: persistedCollapsed }
        : {}),
      ...(typeof userModified === 'boolean' ? { workspaceMapUserModified: userModified } : {}),
    },
    draggable: pinned ? false : incoming.draggable,
    height: preserveCurrentGeometry ? (current.height ?? incoming.height) : incoming.height,
    measured: preserveCurrentGeometry ? current.measured : incoming.measured,
    position: current.position,
    style:
      preserveCurrentGeometry && current.style
        ? { ...incoming.style, ...current.style }
        : incoming.style,
    width: preserveCurrentGeometry ? (current.width ?? incoming.width) : incoming.width,
  }
}

const numericStyleDimension = (node: Node<GraphNodeData>, key: 'height' | 'width') => {
  const value = node.style?.[key]
  return typeof value === 'number' ? value : undefined
}
