import type { Edge, Node } from '@xyflow/react'

import type { GraphNodeData } from '@/logic/graph'

export type GraphNodeKind = 'file' | 'heading' | 'external' | 'missing' | 'preview' | 'unknown'
export type GraphFilterKind = Exclude<GraphNodeKind, 'unknown'>

export type GraphFilterState = {
  query: string
  kinds: Record<GraphFilterKind, boolean>
}

export type GraphFilterStats = Record<GraphFilterKind, number>

export type GraphNodeConnection = {
  edge: Edge
  node: Node<GraphNodeData>
}

export type GraphNodeDetails = {
  content?: string
  incoming: GraphNodeConnection[]
  kind: GraphNodeKind
  label: string
  level?: number
  line?: number
  node: Node<GraphNodeData>
  openPath?: string
  outgoing: GraphNodeConnection[]
  path?: string
  subtitle?: string
  url?: string
}

export const createDefaultGraphFilters = (): GraphFilterState => ({
  query: '',
  kinds: {
    external: true,
    file: true,
    heading: true,
    missing: true,
    preview: true,
  },
})

export const getGraphNodeKind = (node: Node<GraphNodeData>): GraphNodeKind => {
  if (node.type === 'heading' || node.id.startsWith('heading:')) return 'heading'
  if (node.type === 'external' || node.id.startsWith('ext:')) return 'external'
  if (node.type === 'missing' || node.id.startsWith('missing:')) return 'missing'
  if (node.type === 'preview' || node.id.startsWith('preview:')) return 'preview'
  if (node.id.startsWith('file:')) return 'file'
  return 'unknown'
}

export const getGraphNodePath = (node: Node<GraphNodeData>) => {
  if (typeof node.data.path === 'string' && node.data.path.length > 0) return node.data.path

  if (node.id.startsWith('file:')) return node.id.slice('file:'.length)
  if (node.id.startsWith('missing:')) return node.id.slice('missing:'.length)

  if (node.id.startsWith('heading:')) {
    const value = node.id.slice('heading:'.length)
    const slugSeparator = value.lastIndexOf(':')
    return slugSeparator > 0 ? value.slice(0, slugSeparator) : undefined
  }

  return undefined
}

export const getGraphNodeOpenPath = (node: Node<GraphNodeData>) => {
  const kind = getGraphNodeKind(node)
  if (kind !== 'file' && kind !== 'heading' && kind !== 'preview') return undefined
  return getGraphNodePath(node)
}

export const filterGraphElements = (
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  filters: GraphFilterState,
) => {
  const query = normalizeQuery(filters.query)
  const visibleNodes = nodes.filter((node) => {
    const kind = getGraphNodeKind(node)
    if (kind !== 'unknown' && !filters.kinds[kind]) return false
    if (!query) return true
    return getGraphNodeSearchText(node).includes(query)
  })
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const visibleEdges = edges.filter(
    (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
  )

  return { nodes: visibleNodes, edges: visibleEdges }
}

export const getGraphFilterStats = (nodes: Node<GraphNodeData>[]): GraphFilterStats => {
  const stats: GraphFilterStats = {
    external: 0,
    file: 0,
    heading: 0,
    missing: 0,
    preview: 0,
  }

  nodes.forEach((node) => {
    const kind = getGraphNodeKind(node)
    if (kind !== 'unknown') {
      stats[kind] += 1
    }
  })

  return stats
}

export const hasActiveGraphFilters = (filters: GraphFilterState) => {
  if (normalizeQuery(filters.query)) return true
  return Object.values(filters.kinds).some((enabled) => !enabled)
}

export const buildGraphNodeDetails = (
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  nodeId: string | null,
): GraphNodeDetails | null => {
  if (!nodeId) return null

  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const node = nodesById.get(nodeId)
  if (!node) return null

  const incoming: GraphNodeConnection[] = []
  const outgoing: GraphNodeConnection[] = []

  edges.forEach((edge) => {
    if (edge.target === nodeId) {
      const sourceNode = nodesById.get(edge.source)
      if (sourceNode) incoming.push({ edge, node: sourceNode })
    }
    if (edge.source === nodeId) {
      const targetNode = nodesById.get(edge.target)
      if (targetNode) outgoing.push({ edge, node: targetNode })
    }
  })

  return {
    content: getStringData(node, 'content'),
    incoming,
    kind: getGraphNodeKind(node),
    label: node.data.label,
    level: getNumberData(node, 'level'),
    line: getNumberData(node, 'line'),
    node,
    openPath: getGraphNodeOpenPath(node),
    outgoing,
    path: getGraphNodePath(node),
    subtitle: getStringData(node, 'subtitle'),
    url: getStringData(node, 'url'),
  }
}

const normalizeQuery = (value: string) => value.trim().toLowerCase()

const getGraphNodeSearchText = (node: Node<GraphNodeData>) =>
  [
    node.id,
    node.data.label,
    getStringData(node, 'subtitle'),
    getGraphNodePath(node),
    getStringData(node, 'url'),
    getStringData(node, 'content'),
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n')
    .toLowerCase()

const getStringData = (node: Node<GraphNodeData>, key: keyof GraphNodeData) => {
  const value = node.data[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const getNumberData = (node: Node<GraphNodeData>, key: keyof GraphNodeData) => {
  const value = node.data[key]
  return typeof value === 'number' ? value : undefined
}
