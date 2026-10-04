import type { Edge } from '@xyflow/react'
import type { GraphData } from '@/logic/graph'
import { createGraphLayoutKey } from '@/logic/graphLayoutKey'

const WORKSPACE_MAP_NODE_TYPES = new Set(['file', 'preview', 'missing', 'external'])

export const buildWorkspaceMapGraph = (graph: GraphData): GraphData => {
  const nodes = graph.nodes
    .filter((node) => WORKSPACE_MAP_NODE_TYPES.has(node.type ?? ''))
    .map((node) => ({
      ...node,
      data: { ...node.data, workspaceMap: true as const },
      position: { ...node.position },
    }))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const headingEndpoints = new Map<string, string>()

  for (const node of graph.nodes) {
    if (node.type !== 'heading' || typeof node.data.path !== 'string') continue
    headingEndpoints.set(node.id, `file:${node.data.path}`)
  }

  const resolveEndpoint = (id: string) => {
    if (nodeIds.has(id)) return id
    return headingEndpoints.get(id) ?? null
  }

  const edges: Edge[] = []
  const edgeIndexes = new Map<string, number>()
  for (const edge of graph.edges) {
    const source = resolveEndpoint(edge.source)
    const target = resolveEndpoint(edge.target)
    if (!source || !target || source === target) continue
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue

    const kind = typeof edge.data?.kind === 'string' ? edge.data.kind : ''
    const [normalizedSource, normalizedTarget] = normalizeEdgeEndpoints(source, target)
    const edgeKey = createEdgeKey(normalizedSource, normalizedTarget)
    const existingIndex = edgeIndexes.get(edgeKey)
    if (existingIndex !== undefined) {
      const existing = edges[existingIndex]
      const existingKind = typeof existing?.data?.kind === 'string' ? existing.data.kind : ''
      if (edgeKindRank(kind) < edgeKindRank(existingKind) && existing) {
        edges[existingIndex] = {
          ...existing,
          ...(edge.data ? { data: { ...edge.data } } : { data: undefined }),
        }
      }
      continue
    }
    edgeIndexes.set(edgeKey, edges.length)

    edges.push({
      id: `workspace-map:${edgeKey}`,
      source: normalizedSource,
      target: normalizedTarget,
      type: 'smoothstep',
      className: 'graph-edge--reference',
      ...(kind !== 'contains' && edge.data ? { data: { ...edge.data } } : {}),
    })
  }

  return {
    nodes,
    edges,
    layoutKey: createGraphLayoutKey('workspace-map', nodes, edges),
  }
}

const createEdgeKey = (source: string, target: string) => {
  return `${source.length}:${source}${target.length}:${target}`
}

const normalizeEdgeEndpoints = (source: string, target: string) =>
  source.localeCompare(target) <= 0 ? ([source, target] as const) : ([target, source] as const)

const edgeKindRank = (kind: string) => {
  if (kind === 'references_heading') return 0
  if (kind === 'links_to') return 1
  if (kind === 'previews') return 2
  return 3
}
