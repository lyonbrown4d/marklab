import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { getGraphNodeLayoutSize } from '@/logic/graphLayoutMetrics'
import { graphComputeApi } from '@/services/graphComputeApi'

type GraphLayoutOptions = { layoutKey?: string; signal?: AbortSignal }

// Only dimensions and topology cross IPC; document text and editor state stay here.
export const layoutGraphNative = async (
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  options: GraphLayoutOptions = {},
): Promise<Node<GraphNodeData>[]> => {
  if (options.signal?.aborted) throw new DOMException('Graph layout was cancelled.', 'AbortError')
  if (nodes.length === 0) return nodes
  const overview = nodes.some((node) => node.data.workspaceMapMode === 'overview')
  const known = new Set(nodes.map((node) => node.id))
  const { positions } = await graphComputeApi.layout(
    {
      mode: overview ? 'overview' : 'focus',
      nodes: nodes.map((node) => ({
        id: node.id,
        ...getGraphNodeLayoutSize(node),
        ...(overview && node.data.workspaceGroup?.key
          ? { group: node.data.workspaceGroup.key }
          : {}),
      })),
      edges: overview
        ? []
        : edges
            .filter((edge) => known.has(edge.source) && known.has(edge.target))
            .map(({ source, target }) => ({ source, target })),
    },
    options.signal,
  )
  const byId = new Map(positions.map((position) => [position.id, position]))
  if (
    positions.length !== nodes.length ||
    byId.size !== nodes.length ||
    nodes.some((node) => !byId.has(node.id))
  ) {
    throw new Error('Native graph layout returned incomplete positions.')
  }
  return nodes.map((node) => {
    const position = byId.get(node.id)
    return position ? { ...node, position: { x: position.x, y: position.y } } : node
  })
}
