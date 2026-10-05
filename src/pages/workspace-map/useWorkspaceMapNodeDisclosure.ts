import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Node } from '@xyflow/react'
import { useMemoizedFn } from 'ahooks'
import type { GraphNodeData } from '@/logic/graph'
import {
  WORKSPACE_MAP_COMPACT_NODE_HEIGHT,
  WORKSPACE_MAP_COMPACT_NODE_WIDTH,
  WORKSPACE_MAP_FILE_HEIGHT,
  WORKSPACE_MAP_FILE_WIDTH,
  WORKSPACE_MAP_RESOURCE_NODE_HEIGHT,
  WORKSPACE_MAP_RESOURCE_NODE_WIDTH,
} from '@/logic/graphLayoutMetrics'

type Options = {
  activePath: string | null
  defaultCollapsed?: boolean
  graphIdentity: string
  nodes: Node<GraphNodeData>[]
  setNodes: Dispatch<SetStateAction<Node<GraphNodeData>[]>>
}

type NodeGeometry = Pick<Node<GraphNodeData>, 'height' | 'measured' | 'style' | 'width'>

type DisclosureState = {
  collapsedNodeIds: Set<string>
  defaultCollapsed: boolean
  graphIdentity: string
  knownNodeIds: Set<string>
}

type RenderedNodeCacheEntry = {
  active: boolean
  collapsed: boolean
  renderedNode: Node<GraphNodeData>
  sourceNode: Node<GraphNodeData>
  toggle: (nodeId: string) => void
}

const isRichWorkspaceNode = (node: Node<GraphNodeData>) =>
  node.type === 'file' ||
  (node.type === 'preview' && Boolean(node.data.previewKind)) ||
  (node.type === 'external' && Boolean(node.data.webView))

const compactNode = (node: Node<GraphNodeData>): Node<GraphNodeData> => ({
  ...node,
  height: WORKSPACE_MAP_COMPACT_NODE_HEIGHT,
  measured: {
    height: WORKSPACE_MAP_COMPACT_NODE_HEIGHT,
    width: WORKSPACE_MAP_COMPACT_NODE_WIDTH,
  },
  style: {
    ...node.style,
    height: WORKSPACE_MAP_COMPACT_NODE_HEIGHT,
    width: WORKSPACE_MAP_COMPACT_NODE_WIDTH,
  },
  width: WORKSPACE_MAP_COMPACT_NODE_WIDTH,
})

const expandedNode = (node: Node<GraphNodeData>): Node<GraphNodeData> => {
  const file = node.type === 'file'
  const width = file ? WORKSPACE_MAP_FILE_WIDTH : WORKSPACE_MAP_RESOURCE_NODE_WIDTH
  const height = file ? WORKSPACE_MAP_FILE_HEIGHT : WORKSPACE_MAP_RESOURCE_NODE_HEIGHT
  return {
    ...node,
    height,
    measured: { height, width },
    style: { ...node.style, height, width },
    width,
  }
}

const createDisclosureState = (
  graphIdentity: string,
  defaultCollapsed: boolean,
  nodes: Node<GraphNodeData>[],
): DisclosureState => {
  const richNodeIds = nodes.filter(isRichWorkspaceNode).map((node) => node.id)
  return {
    collapsedNodeIds: new Set(defaultCollapsed ? richNodeIds : []),
    defaultCollapsed,
    graphIdentity,
    knownNodeIds: new Set(richNodeIds),
  }
}

const normalizeDisclosureState = (
  state: DisclosureState,
  graphIdentity: string,
  defaultCollapsed: boolean,
  nodes: Node<GraphNodeData>[],
): DisclosureState => {
  if (state.graphIdentity !== graphIdentity) {
    return createDisclosureState(graphIdentity, defaultCollapsed, nodes)
  }

  const richNodeIds = nodes.filter(isRichWorkspaceNode).map((node) => node.id)
  const newlyCompact = defaultCollapsed && !state.defaultCollapsed
  const newNodeIds = richNodeIds.filter((nodeId) => !state.knownNodeIds.has(nodeId))
  if (!newlyCompact && newNodeIds.length === 0 && state.defaultCollapsed === defaultCollapsed) {
    return state
  }

  const collapsedNodeIds = newlyCompact ? new Set(richNodeIds) : new Set(state.collapsedNodeIds)
  if (defaultCollapsed) newNodeIds.forEach((nodeId) => collapsedNodeIds.add(nodeId))
  return {
    collapsedNodeIds,
    defaultCollapsed,
    graphIdentity,
    knownNodeIds: new Set([...state.knownNodeIds, ...richNodeIds]),
  }
}

const createNodePresenter = () => {
  let cache = new Map<string, RenderedNodeCacheEntry>()
  return (
    nodes: Node<GraphNodeData>[],
    activePath: string | null,
    collapsedNodeIds: Set<string>,
    toggleNode: (nodeId: string) => void,
  ) => {
    const nextCache = new Map<string, RenderedNodeCacheEntry>()
    const rendered = nodes.map((node) => {
      if (!isRichWorkspaceNode(node)) return node
      const active =
        Boolean(node.data.workspaceMapEditor) ||
        node.data.path === activePath ||
        Boolean(node.data.webView?.active)
      const collapsed = collapsedNodeIds.has(node.id)
      const cached = cache.get(node.id)
      if (
        cached?.sourceNode === node &&
        cached.active === active &&
        cached.collapsed === collapsed &&
        cached.toggle === toggleNode
      ) {
        nextCache.set(node.id, cached)
        return cached.renderedNode
      }
      const presentedNode = active && collapsed ? expandedNode(node) : node
      const renderedNode =
        active && presentedNode.data.workspaceMapDisclosure === undefined
          ? presentedNode
          : {
              ...presentedNode,
              data: {
                ...presentedNode.data,
                workspaceMapDisclosure: active ? undefined : { collapsed, toggle: toggleNode },
              },
            }
      nextCache.set(node.id, {
        active,
        collapsed,
        renderedNode,
        sourceNode: node,
        toggle: toggleNode,
      })
      return renderedNode
    })
    cache = nextCache
    return rendered
  }
}

export const useWorkspaceMapNodeDisclosure = ({
  activePath,
  defaultCollapsed = false,
  graphIdentity,
  nodes,
  setNodes,
}: Options) => {
  const [disclosureState, setDisclosureState] = useState<DisclosureState>(() =>
    createDisclosureState(graphIdentity, defaultCollapsed, nodes),
  )
  const effectiveState = useMemo(
    () => normalizeDisclosureState(disclosureState, graphIdentity, defaultCollapsed, nodes),
    [defaultCollapsed, disclosureState, graphIdentity, nodes],
  )
  const expandedGeometryRef = useRef(new Map<string, NodeGeometry>())
  const presentNodes = useMemo(() => createNodePresenter(), [])

  const setCollapsed = useMemoizedFn((nodeId: string, collapsed: boolean) => {
    const geometryKey = `${graphIdentity}\0${nodeId}`
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId || !isRichWorkspaceNode(node)) return node
        if (collapsed) {
          expandedGeometryRef.current.set(geometryKey, {
            height: node.height ?? node.measured?.height,
            measured: node.measured,
            style: node.style,
            width: node.width ?? node.measured?.width,
          })
          return compactNode(node)
        }
        const geometry = expandedGeometryRef.current.get(geometryKey)
        if (!geometry) return expandedNode(node)
        expandedGeometryRef.current.delete(geometryKey)
        return { ...node, ...geometry }
      }),
    )
    setDisclosureState((current) => {
      const normalized = normalizeDisclosureState(current, graphIdentity, defaultCollapsed, nodes)
      if (normalized.collapsedNodeIds.has(nodeId) === collapsed) return normalized
      const next = new Set(normalized.collapsedNodeIds)
      if (collapsed) next.add(nodeId)
      else next.delete(nodeId)
      return { ...normalized, collapsedNodeIds: next }
    })
  })

  const toggleNode = useMemoizedFn((nodeId: string) => {
    const node = nodes.find((candidate) => candidate.id === nodeId)
    if (
      !node ||
      node.data.workspaceMapEditor ||
      node.data.path === activePath ||
      node.data.webView?.active
    )
      return
    setCollapsed(nodeId, !effectiveState.collapsedNodeIds.has(nodeId))
  })

  const renderedNodes = useMemo(
    () => presentNodes(nodes, activePath, effectiveState.collapsedNodeIds, toggleNode),
    [activePath, effectiveState.collapsedNodeIds, nodes, presentNodes, toggleNode],
  )

  return { nodes: renderedNodes }
}
