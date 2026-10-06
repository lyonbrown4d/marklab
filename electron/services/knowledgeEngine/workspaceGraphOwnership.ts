import type { FsGraphEdge } from '@electron/services/workspace/types.js'

export const createWorkspaceNodeOwnerResolver = (knownIds: Set<string>, edges: FsGraphEdge[]) => {
  const parents = new Map<string, string>()
  edges.forEach((edge) => {
    if (edge.kind === 'contains' && !parents.has(edge.target)) {
      parents.set(edge.target, edge.source)
    }
  })
  const cache = new Map<string, string | null>()

  return (nodeId: string): string | null => {
    if (knownIds.has(nodeId)) return nodeId
    const visited: string[] = []
    const seen = new Set<string>()
    let current = nodeId
    const remember = (owner: string | null) => {
      visited.forEach((id) => cache.set(id, owner))
      return owner
    }

    while (!knownIds.has(current)) {
      if (seen.has(current)) return remember(null)
      if (cache.has(current)) return remember(cache.get(current) ?? null)
      seen.add(current)
      visited.push(current)
      const parent = parents.get(current)
      if (!parent) return remember(null)
      current = parent
    }
    return remember(current)
  }
}
