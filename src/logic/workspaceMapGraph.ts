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
  const edgeKeys = new Set<string>()
  for (const edge of graph.edges) {
    const source = resolveEndpoint(edge.source)
    const target = resolveEndpoint(edge.target)
    if (!source || !target || source === target) continue
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue

    const kind = typeof edge.data?.kind === 'string' ? edge.data.kind : ''
    const edgeKey = createEdgeKey(source, target, kind)
    if (edgeKeys.has(edgeKey)) continue
    edgeKeys.add(edgeKey)

    edges.push({
      id: `workspace-map:${edgeKey}`,
      source,
      target,
      type: 'smoothstep',
      ...(kind !== 'contains' && edge.data ? { data: { ...edge.data } } : {}),
    })
  }

  return {
    nodes,
    edges,
    layoutKey: createGraphLayoutKey('workspace-map', nodes, edges),
  }
}

const createEdgeKey = (source: string, target: string, kind: string) =>
  `${source.length}:${source}${target.length}:${target}${kind.length}:${kind}`
