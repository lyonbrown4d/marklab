import type { Node } from '@xyflow/react'

import type { GraphNodeData } from '@/logic/graph'
import { getGraphNodeLayoutSize } from '@/logic/graphLayoutMetrics'
import type {
  GraphLayoutNode,
  GraphLayoutRequest,
  GraphLayoutResult,
  GraphLayoutSave,
  GraphLayoutViewport,
} from '@/services/graphLayoutApi'

const PERSISTED_COLLAPSED_KEY = 'workspaceMapPersistedCollapsed'
const USER_MODIFIED_KEY = 'workspaceMapUserModified'

export const applyStoredWorkspaceMapLayout = (
  nodes: Node<GraphNodeData>[],
  stored: GraphLayoutResult,
): Node<GraphNodeData>[] => {
  const storedById = new Map(stored.nodes.map((node) => [node.id, node]))
  return nodes.map((node) => {
    const saved = storedById.get(node.id)
    if (!saved) return node
    const restoreGeometry = stored.match === 'exact' || saved.userModified
    return {
      ...node,
      data: {
        ...node.data,
        [PERSISTED_COLLAPSED_KEY]: saved.collapsed,
        workspaceMapPinned: saved.pinned,
        [USER_MODIFIED_KEY]: saved.userModified,
      },
      draggable: saved.pinned ? false : node.draggable,
      ...(restoreGeometry
        ? {
            height: saved.height,
            measured: { height: saved.height, width: saved.width },
            position: { x: saved.x, y: saved.y },
            style: { ...node.style, height: saved.height, width: saved.width },
            width: saved.width,
          }
        : {}),
    }
  })
}

export const createWorkspaceMapLayoutSave = (
  request: GraphLayoutRequest,
  nodes: Node<GraphNodeData>[],
  viewport: GraphLayoutViewport | null,
): GraphLayoutSave => ({
  ...request,
  nodes: nodes.map(toStoredNode),
  viewport,
})

export const markWorkspaceMapUserModified = (
  nodes: Node<GraphNodeData>[],
  nodeIds: ReadonlySet<string>,
): Node<GraphNodeData>[] =>
  nodes.map((node) =>
    nodeIds.has(node.id) ? { ...node, data: { ...node.data, [USER_MODIFIED_KEY]: true } } : node,
  )

export const resetWorkspaceMapUserPositions = (
  nodes: Node<GraphNodeData>[],
): Node<GraphNodeData>[] =>
  nodes.map((node) => ({
    ...node,
    data: { ...node.data, [USER_MODIFIED_KEY]: false },
  }))

export const mergeWorkspaceMapArrangementOverrides = (
  arranged: Node<GraphNodeData>[],
  current: Node<GraphNodeData>[],
): Node<GraphNodeData>[] => {
  const currentById = new Map(current.map((node) => [node.id, node]))
  return arranged.map((node) => {
    const existing = currentById.get(node.id)
    if (!existing) return node
    const size = toStoredNode(existing)
    return {
      ...node,
      data: {
        ...node.data,
        [PERSISTED_COLLAPSED_KEY]: size.collapsed,
        workspaceMapPinned: size.pinned,
        [USER_MODIFIED_KEY]: false,
      },
      draggable: size.pinned ? false : node.draggable,
      height: size.height,
      measured: { height: size.height, width: size.width },
      style: { ...node.style, height: size.height, width: size.width },
      width: size.width,
    }
  })
}

export const isWorkspaceMapNodeUserModified = (node: Node<GraphNodeData>): boolean =>
  node.data[USER_MODIFIED_KEY] === true

export const isWorkspaceMapNodePersistedCollapsed = (node: Node<GraphNodeData>): boolean =>
  node.data[PERSISTED_COLLAPSED_KEY] === true

export const createWorkspaceMapLayoutStateRevision = (nodes: Node<GraphNodeData>[]): string => {
  let hash = 0x811c9dc5
  const write = (value: unknown) => {
    const text = String(value ?? '')
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193)
    }
    hash = Math.imul(hash ^ 0, 0x01000193)
  }
  nodes.forEach((node) => {
    const size = toStoredNode(node)
    write(node.id)
    write(size.x)
    write(size.y)
    write(size.width)
    write(size.height)
    write(size.collapsed)
    write(size.pinned)
    write(size.userModified)
  })
  return `${nodes.length}:${(hash >>> 0).toString(36)}`
}

export const readWorkspaceMapNodePersistedCollapsed = (
  node: Node<GraphNodeData>,
): boolean | undefined => {
  const value = node.data[PERSISTED_COLLAPSED_KEY]
  return typeof value === 'boolean' ? value : undefined
}

const toStoredNode = (node: Node<GraphNodeData>): GraphLayoutNode => {
  const fallback = getGraphNodeLayoutSize(node)
  const width =
    node.width ?? node.measured?.width ?? numericStyleDimension(node, 'width') ?? fallback.width
  const height =
    node.height ?? node.measured?.height ?? numericStyleDimension(node, 'height') ?? fallback.height
  const disclosure = node.data.workspaceMapDisclosure
  return {
    collapsed: disclosure?.collapsed ?? node.data[PERSISTED_COLLAPSED_KEY] === true,
    height,
    id: node.id,
    pinned: node.data.workspaceMapPinned === true,
    userModified: node.data[USER_MODIFIED_KEY] === true,
    width,
    x: node.position.x,
    y: node.position.y,
  }
}

const numericStyleDimension = (node: Node<GraphNodeData>, key: 'height' | 'width') => {
  const value = node.style?.[key]
  return typeof value === 'number' ? value : undefined
}
