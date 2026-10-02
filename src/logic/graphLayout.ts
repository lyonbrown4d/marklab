import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { getGraphNodeLayoutSize } from '@/logic/graphLayoutMetrics'
import { graphLayoutWorkerClient } from '@/logic/graphLayoutWorkerClient'
import type { GraphLayoutPosition, GraphLayoutWorkerGraph } from '@/logic/graphLayoutWorkerMessages'

type GraphLayoutOptions = {
  layoutKey?: string
  signal?: AbortSignal
}

const MAX_CACHED_LAYOUTS = 8
const layoutCache = new Map<string, GraphLayoutPosition[]>()

const getCachedLayout = (layoutKey: string) => {
  const cached = layoutCache.get(layoutKey)
  if (!cached) return undefined
  layoutCache.delete(layoutKey)
  layoutCache.set(layoutKey, cached)
  return cached
}

const cacheLayout = (layoutKey: string, positions: GraphLayoutPosition[]) => {
  layoutCache.delete(layoutKey)
  layoutCache.set(layoutKey, positions)
  while (layoutCache.size > MAX_CACHED_LAYOUTS) {
    const oldestKey = layoutCache.keys().next().value
    if (oldestKey === undefined) break
    layoutCache.delete(oldestKey)
  }
}

const createWorkerGraph = (nodes: Node<GraphNodeData>[], edges: Edge[]): GraphLayoutWorkerGraph => {
  const knownNodeIds = new Set(nodes.map((node) => node.id))
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.spacing.edgeNodeBetweenLayers': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '220',
      'elk.spacing.edgeEdge': '24',
      'elk.spacing.edgeNode': '36',
      'elk.spacing.nodeNode': '72',
    },
    children: nodes.map((node) => ({ id: node.id, ...getGraphNodeLayoutSize(node) })),
    edges: edges
      .filter((edge) => knownNodeIds.has(edge.source) && knownNodeIds.has(edge.target))
      .map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  }
}

const applyPositions = (nodes: Node<GraphNodeData>[], positions: GraphLayoutPosition[]) => {
  const positionsById = new Map(positions.map((position) => [position.id, position]))
  return nodes.map((node) => {
    const position = positionsById.get(node.id)
    return position ? { ...node, position: { x: position.x, y: position.y } } : node
  })
}

export const preloadGraphLayout = () => graphLayoutWorkerClient.warmup()

export const layoutGraphWithElk = async (
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  options: GraphLayoutOptions = {},
): Promise<Node<GraphNodeData>[]> => {
  if (nodes.length === 0) return nodes
  if (options.signal?.aborted) throw new DOMException('Graph layout was cancelled.', 'AbortError')

  const cached = options.layoutKey ? getCachedLayout(options.layoutKey) : undefined
  if (cached) return applyPositions(nodes, cached)

  const positions = await graphLayoutWorkerClient.layout(
    createWorkerGraph(nodes, edges),
    options.signal,
  )
  if (options.layoutKey) cacheLayout(options.layoutKey, positions)
  return applyPositions(nodes, positions)
}
