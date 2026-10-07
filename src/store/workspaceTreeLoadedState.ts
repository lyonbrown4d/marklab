import type { WorkspaceTreeDeltaEvent } from '@/types/workspaceTree'

type LoadedTreeState = {
  loadedTreeParents: string[]
  rootCursorStale: boolean
  treeNextCursors: Record<string, null>
}

const remapParent = (parent: string, event: WorkspaceTreeDeltaEvent): string | null => {
  if (event.kind !== 'changes') return parent
  let next = parent
  for (const change of event.changes) {
    if (change.type === 'removed') {
      if (next === change.path || next.startsWith(`${change.path}/`)) return null
      continue
    }
    if (change.type === 'renamed' && (next === change.from || next.startsWith(`${change.from}/`))) {
      next = `${change.entry.path}${next.slice(change.from.length)}`
    }
  }
  return next
}

export const reconcileLoadedTreeState = (
  loadedTreeParents: string[],
  treeNextCursors: Record<string, string | null>,
  event: WorkspaceTreeDeltaEvent,
): LoadedTreeState => {
  const rootCursorStale = Boolean(treeNextCursors[''])
  const parents = new Set<string>()
  const cursors: Record<string, null> = {}
  for (const parent of loadedTreeParents) {
    if (treeNextCursors[parent]) continue
    const remapped = remapParent(parent, event)
    if (remapped === null) continue
    parents.add(remapped)
    cursors[remapped] = null
  }
  return {
    loadedTreeParents: [...parents],
    rootCursorStale,
    treeNextCursors: cursors,
  }
}
