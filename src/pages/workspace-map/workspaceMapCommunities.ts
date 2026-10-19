import type { GraphData } from '@/logic/graph'
import type { GraphCommunity } from '@/services/graphComputeApi'

export const ALL_GRAPH_VIEW = 'all'
export const COMMUNITY_GRAPH_LIMIT = 80

export const indexGraphCommunities = (graph: GraphData, communities: GraphCommunity[]) => {
  const known = new Set(graph.nodes.map((node) => node.id))
  const membership = new Map<string, string>()
  for (const community of communities) {
    for (const id of community.nodeIds) {
      if (!known.has(id) || membership.has(id))
        throw new Error('Invalid graph community membership.')
      membership.set(id, community.id)
    }
  }
  if (membership.size !== known.size) throw new Error('Incomplete graph communities.')
  return membership
}

export const createWorkspaceMapCommunityGraph = (
  graph: GraphData,
  community: GraphCommunity | undefined,
): GraphData => {
  if (!community) return graph
  const ids = new Set(community.nodeIds)
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => ids.has(node.id)),
    edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    layoutKey: `${graph.layoutKey ?? 'workspace-map'}:community:${community.id}`,
  }
}

export const graphCommunityLinks = (
  graph: GraphData,
  viewId: string,
  membership: ReadonlyMap<string, string>,
) => {
  const targets = new Map<string, { count: number; nodeId: string }>()
  for (const edge of graph.edges) {
    const source = membership.get(edge.source)
    const target = membership.get(edge.target)
    if (!source || !target || source === target) continue
    const other = source === viewId ? target : target === viewId ? source : null
    if (!other) continue
    const existing = targets.get(other)
    targets.set(other, {
      count: (existing?.count ?? 0) + 1,
      nodeId: existing?.nodeId ?? (source === viewId ? edge.target : edge.source),
    })
  }
  return targets
}
