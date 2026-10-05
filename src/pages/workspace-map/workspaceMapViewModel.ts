import type { Edge, Node } from '@xyflow/react'
import type { GraphData, GraphNodeData } from '@/logic/graph'
import {
  WORKSPACE_MAP_COMPACT_NODE_HEIGHT,
  WORKSPACE_MAP_COMPACT_NODE_WIDTH,
} from '@/logic/graphLayoutMetrics'

export const LARGE_WORKSPACE_MAP_NODE_THRESHOLD = 12

const isExternalNode = (node: Node<GraphNodeData>) => node.type === 'external'

const isRichNode = (node: Node<GraphNodeData>) =>
  node.type === 'file' ||
  (node.type === 'preview' && Boolean(node.data.previewKind)) ||
  (node.type === 'external' && Boolean(node.data.url))

export const createWorkspaceMapViewGraph = (
  graph: GraphData,
  showExternalResources: boolean,
): { graph: GraphData; totalExternalCount: number } => {
  const totalExternalCount = graph.nodes.filter(isExternalNode).length
  if (showExternalResources || totalExternalCount === 0) {
    return { graph, totalExternalCount }
  }

  const nodes = graph.nodes.filter((node) => !isExternalNode(node))
  const visibleIds = new Set(nodes.map((node) => node.id))
  const edges = graph.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  )
  return {
    graph: {
      ...graph,
      edges,
      layoutKey: `${graph.layoutKey ?? 'workspace-map'}:internal`,
      nodes,
    },
    totalExternalCount,
  }
}

export const shouldCompactWorkspaceMap = (nodes: Node<GraphNodeData>[]) =>
  nodes.filter(isRichNode).length >= LARGE_WORKSPACE_MAP_NODE_THRESHOLD

export const applyWorkspaceMapCompactGeometry = (
  node: Node<GraphNodeData>,
  compact: boolean,
  activePath: string | null,
): Node<GraphNodeData> => {
  const active = node.type === 'file' && node.data.path === activePath
  if (!compact || active || !isRichNode(node)) return node

  return {
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
  }
}

export const getWorkspaceMapInitialFocusPath = (graph: GraphData): string | null => {
  const fileNodes = graph.nodes.filter(
    (node): node is Node<GraphNodeData> => node.type === 'file' && Boolean(node.data.path),
  )
  if (fileNodes.length === 0) return null

  const home = fileNodes.find(
    (node) => getBaseName(node.data.path ?? '').toLowerCase() === 'home.md',
  )
  if (home?.data.path) return home.data.path

  const degree = getNodeDegree(graph.edges)
  const ranked = [...fileNodes].sort((left, right) => {
    const degreeDifference = (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0)
    if (degreeDifference !== 0) return degreeDifference
    return (left.data.path ?? '').localeCompare(right.data.path ?? '')
  })
  return ranked[0]?.data.path ?? null
}

const getBaseName = (path: string) => path.replaceAll('\\', '/').split('/').at(-1) ?? path

const getNodeDegree = (edges: Edge[]) => {
  const degree = new Map<string, number>()
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
  }
  return degree
}
