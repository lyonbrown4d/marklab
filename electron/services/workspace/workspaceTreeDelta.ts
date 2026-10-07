import type { FsEntry, FsRootInfo } from '@electron/services/workspace/types'
import type { WorkspaceTreeChange, WorkspaceTreeDeltaEvent } from '@/types/workspaceTree'

const sameRoot = (left: FsRootInfo | null, right: FsRootInfo): boolean =>
  left?.kind === right.kind && left.path === right.path

const toMap = (entries: FsEntry[]): Map<string, FsEntry> =>
  new Map(entries.map((entry) => [entry.path, entry]))

const byPath = (left: { path: string }, right: { path: string }) =>
  left.path.localeCompare(right.path)

const MAX_DELTA_CHANGES = 1_024
const MAX_DELTA_BYTES = 256 * 1_024
type ExplicitRename = { from: string; to: string }

export class WorkspaceTreeDeltaTracker {
  private entries: Map<string, FsEntry> | null = null
  private root: FsRootInfo | null = null
  private currentRevision = 0

  get revision(): number {
    return this.currentRevision
  }

  get hasBaseline(): boolean {
    return this.entries !== null
  }

  observe(entries: FsEntry[], root?: FsRootInfo): void {
    this.entries = toMap(entries)
    if (root) this.root = { ...root }
  }

  advance(
    root: FsRootInfo,
    entries: FsEntry[],
    changedPaths: string[] = [],
    explicitRenames: ExplicitRename[] = [],
    generation = 0,
  ): WorkspaceTreeDeltaEvent {
    const previousRevision = this.currentRevision
    this.currentRevision += 1
    const previous = this.entries
    const rootChanged = this.root !== null && !sameRoot(this.root, root)
    this.entries = toMap(entries)
    this.root = { ...root }
    if (!previous || rootChanged) {
      return {
        generation,
        kind: 'invalidated',
        previousRevision,
        revision: this.currentRevision,
        root,
      }
    }
    const removed = new Map<string, FsEntry>()
    const added = new Map<string, FsEntry>()
    for (const [entryPath, entry] of previous) {
      if (!this.entries.has(entryPath)) removed.set(entryPath, entry)
    }
    for (const [entryPath, entry] of this.entries) {
      if (!previous.has(entryPath)) added.set(entryPath, entry)
    }
    const changes = this.diffChanges(removed, added, explicitRenames)
    const touched = new Set(
      changes.flatMap((change) =>
        change.type === 'renamed'
          ? [change.from, change.entry.path]
          : change.type === 'added'
            ? [change.entry.path]
            : [change.path],
      ),
    )
    for (const changedPath of [...new Set(changedPaths)].sort()) {
      if (this.entries.has(changedPath) && !touched.has(changedPath)) {
        changes.push({ type: 'changed', path: changedPath })
      }
    }
    if (isOversized(changes)) {
      return {
        generation,
        kind: 'invalidated',
        previousRevision,
        revision: this.currentRevision,
        root,
      }
    }
    return {
      changes,
      generation,
      kind: 'changes',
      previousRevision,
      revision: this.currentRevision,
      root,
    }
  }

  private diffChanges(
    removed: Map<string, FsEntry>,
    added: Map<string, FsEntry>,
    explicitRenames: ExplicitRename[],
  ): WorkspaceTreeChange[] {
    const changes: WorkspaceTreeChange[] = []
    for (const rename of explicitRenames) {
      const oldEntry = removed.get(rename.from)
      const entry = added.get(rename.to)
      if (!oldEntry || !entry || oldEntry.kind !== entry.kind) continue
      changes.push({ type: 'renamed', from: rename.from, entry })
      deleteTree(removed, rename.from)
      deleteTree(added, rename.to)
    }
    for (const entry of [...removed.values()].sort(byPath)) {
      changes.push({ type: 'removed', path: entry.path })
    }
    for (const entry of [...added.values()].sort(byPath)) changes.push({ type: 'added', entry })
    return changes
  }
}

const deleteTree = (entries: Map<string, FsEntry>, parent: string): void => {
  for (const entryPath of entries.keys()) {
    if (entryPath === parent || entryPath.startsWith(`${parent}/`)) entries.delete(entryPath)
  }
}

const isOversized = (changes: WorkspaceTreeChange[]): boolean => {
  if (changes.length > MAX_DELTA_CHANGES) return true
  let bytes = 0
  for (const change of changes) {
    bytes += Buffer.byteLength(change.type, 'utf8')
    bytes += Buffer.byteLength('path' in change ? change.path : change.entry.path, 'utf8')
    if ('entry' in change) bytes += Buffer.byteLength(change.entry.name, 'utf8')
    if (change.type === 'renamed') bytes += Buffer.byteLength(change.from, 'utf8')
    if (bytes > MAX_DELTA_BYTES) return true
  }
  return false
}
