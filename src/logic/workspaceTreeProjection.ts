import type { FileEntry } from '@/store/appTypes'
import type { WorkspaceTreeDeltaEvent } from '@/types/workspaceTree'

type ProjectionResult = {
  entries: FileEntry[]
  refreshRequired: boolean
  revision: number
}

const replacePrefix = (path: string, from: string, to: string): string => {
  if (path === from) return to
  return path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path
}

export const applyWorkspaceTreeDelta = (
  entries: FileEntry[],
  revision: number,
  event: WorkspaceTreeDeltaEvent,
): ProjectionResult => {
  if (event.previousRevision !== revision || event.kind === 'invalidated') {
    return { entries, revision, refreshRequired: true }
  }
  const removed = new Set(
    event.changes.flatMap((change) => (change.type === 'removed' ? [change.path] : [])),
  )
  const renamed = new Map(
    event.changes.flatMap((change) =>
      change.type === 'renamed' ? [[change.from, change] as const] : [],
    ),
  )
  const byPath = new Map<string, FileEntry>()
  for (const entry of entries) {
    if (hasPathAncestor(entry.path, removed)) continue
    const rename = getPathAncestor(entry.path, renamed)
    const next = rename
      ? { ...entry, path: replacePrefix(entry.path, rename.from, rename.entry.path) }
      : entry
    byPath.set(next.path, next)
  }
  for (const change of event.changes) {
    if (change.type !== 'added') continue
    const parent = change.entry.path.includes('/')
      ? change.entry.path.slice(0, change.entry.path.lastIndexOf('/'))
      : ''
    const parentLoaded = parent === '' || byPath.has(parent)
    if (parentLoaded && !byPath.has(change.entry.path)) {
      byPath.set(change.entry.path, { kind: change.entry.kind, path: change.entry.path })
    }
  }
  const next = [...byPath.values()]
  next.sort((left, right) => left.path.localeCompare(right.path))
  return { entries: next, revision: event.revision, refreshRequired: false }
}

const getPathAncestor = <T>(path: string, values: Map<string, T>): T | null => {
  let candidate = path
  for (;;) {
    const value = values.get(candidate)
    if (value !== undefined) return value
    const separator = candidate.lastIndexOf('/')
    if (separator < 0) return null
    candidate = candidate.slice(0, separator)
  }
}

const hasPathAncestor = (path: string, values: Set<string>): boolean => {
  let candidate = path
  for (;;) {
    if (values.has(candidate)) return true
    const separator = candidate.lastIndexOf('/')
    if (separator < 0) return false
    candidate = candidate.slice(0, separator)
  }
}
