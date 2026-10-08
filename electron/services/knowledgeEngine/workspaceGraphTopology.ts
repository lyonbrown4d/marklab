import { createWorkspaceNodeOwnerResolver } from '@electron/services/knowledgeEngine/workspaceGraphOwnership'
import {
  isStrictTopologyShape,
  normalizeGraphEdgeCandidate,
  normalizeGraphNodeCandidate,
  parseWorkspaceGraphCandidate,
} from '@electron/services/knowledgeEngine/workspaceGraphTopologyValidation'
import type { FsGraph, FsGraphEdge, FsGraphNode } from '@electron/services/workspace/types'

const TOPOLOGY_NODE_KINDS = new Set<FsGraphNode['kind']>(['file', 'missing', 'external', 'preview'])

export const isGraphTopologyOnly = (graph: FsGraph): boolean => {
  if (!isStrictTopologyShape(graph)) return false
  const nodeIds = new Set<string>()
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) return false
    nodeIds.add(node.id)
  }
  const edgeKeys = new Set<string>()
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) {
      return false
    }
    if (edge.source > edge.target) return false
    const key = edgeKey(edge)
    if (edgeKeys.has(key)) return false
    edgeKeys.add(key)
  }
  return true
}

export const graphTopologyOnly = (graph: FsGraph): FsGraph =>
  isGraphTopologyOnly(graph) ? graph : normalizeGraphTopology(graph)

export const parseGraphTopology = (value: unknown): FsGraph | undefined => {
  const candidate = parseWorkspaceGraphCandidate(value)
  return candidate ? normalizeGraphTopology(value) : undefined
}

const normalizeGraphTopology = (graph: unknown): FsGraph => {
  const candidate = parseWorkspaceGraphCandidate(graph)
  if (!candidate) return { mode: 'mindmap', nodes: [], edges: [] }
  const normalizedNodes = candidate.nodes
    .map(normalizeGraphNodeCandidate)
    .filter((node): node is FsGraphNode => node !== undefined)
  const legacyNodes = [...new Map(normalizedNodes.map((node) => [node.id, node])).values()]
  const nodes = legacyNodes.filter((node) => TOPOLOGY_NODE_KINDS.has(node.kind))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const fileIds = new Set(nodes.filter((node) => node.kind === 'file').map((node) => node.id))
  const edges = candidate.edges
    .map(normalizeGraphEdgeCandidate)
    .filter((edge): edge is FsGraphEdge => edge !== undefined)
  const nodeById = new Map(legacyNodes.map((node) => [node.id, node]))
  const resolveOwner = createWorkspaceNodeOwnerResolver(fileIds, edges)
  const resolveEndpoint = (id: string): string | null => {
    if (nodeIds.has(id)) return id
    const node = nodeById.get(id)
    if (node?.kind === 'heading' && node.path) {
      const fileId = `file:${node.path}`
      if (nodeIds.has(fileId)) return fileId
    }
    return resolveOwner(id)
  }

  const deduplicated = new Map<string, FsGraphEdge>()
  for (const edge of edges) {
    const resolvedSource = resolveEndpoint(edge.source)
    const resolvedTarget = resolveEndpoint(edge.target)
    if (!resolvedSource || !resolvedTarget || resolvedSource === resolvedTarget) continue
    const [source, target] = normalizeEndpoints(resolvedSource, resolvedTarget)
    const candidate: FsGraphEdge = { id: edge.id, kind: edge.kind, source, target }
    const key = edgeKey(candidate)
    const existing = deduplicated.get(key)
    if (!existing || compareEdges(candidate, existing) < 0) deduplicated.set(key, candidate)
  }

  const result: FsGraph = {
    mode: 'mindmap',
    edges: [...deduplicated.values()].sort((left, right) =>
      compareText(edgeKey(left), edgeKey(right)),
    ),
    nodes,
  }
  if (candidate.revision !== undefined) result.revision = candidate.revision
  return result
}

const normalizeEndpoints = (source: string, target: string): [string, string] =>
  source < target ? [source, target] : [target, source]

const compareEdges = (left: FsGraphEdge, right: FsGraphEdge): number =>
  edgeKindRank(left.kind) - edgeKindRank(right.kind) || compareText(left.id, right.id)

const edgeKindRank = (kind: FsGraphEdge['kind']): number => {
  if (kind === 'references_heading') return 0
  if (kind === 'links_to') return 1
  if (kind === 'previews') return 2
  return 3
}

const edgeKey = (edge: Pick<FsGraphEdge, 'source' | 'target'>): string =>
  `${edge.source.length}:${edge.source}${edge.target.length}:${edge.target}`

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0
