import { getWorkspaceTabId, normalizeWorkspaceTabId } from '@/logic/tabs'
import type { WorkspaceTab } from '@/store/appTypes'
import type { WorkspaceTreeDeltaEvent } from '@/types/workspaceTree'

const isPathAtOrBelow = (path: string, parent: string) =>
  path === parent || path.startsWith(`${parent}/`)

const replacePathPrefix = (path: string, from: string, to: string) =>
  path === from ? to : `${to}${path.slice(from.length)}`

export const reconcileTabsForTreeDelta = (
  tabs: WorkspaceTab[],
  activeTabId: string | null,
  unavailableTreePaths: string[],
  event: WorkspaceTreeDeltaEvent,
  dirtyPaths: Record<string, true>,
) => {
  if (event.kind !== 'changes') return { tabs, activeTabId, unavailableTreePaths }
  let nextTabs = tabs
  const unavailable = new Set(unavailableTreePaths)
  let nextActiveId = activeTabId
  for (const change of event.changes) {
    if (change.type === 'added') {
      unavailable.delete(change.entry.path)
      continue
    }
    if (change.type !== 'removed' && change.type !== 'renamed') continue
    const source = change.type === 'removed' ? change.path : change.from
    nextTabs = nextTabs.flatMap((tab): WorkspaceTab[] => {
      if (tab.kind === 'web' || !isPathAtOrBelow(tab.path, source)) return [tab]
      if (dirtyPaths[tab.path]) {
        unavailable.add(tab.path)
        return [tab]
      }
      const oldId = getWorkspaceTabId(tab)
      if (change.type === 'removed') return []
      const remapped = { ...tab, path: replacePathPrefix(tab.path, source, change.entry.path) }
      if (oldId === nextActiveId) nextActiveId = getWorkspaceTabId(remapped)
      return [remapped]
    })
  }
  nextActiveId = normalizeWorkspaceTabId(nextActiveId, nextTabs)
  return { tabs: nextTabs, activeTabId: nextActiveId, unavailableTreePaths: [...unavailable] }
}
