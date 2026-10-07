import type { FsEntry, FsRootInfo } from '@electron/services/workspace/types'
import { WorkspaceTreeDeltaTracker } from '@electron/services/workspace/workspaceTreeDelta'
import { WorkspaceTreeQueryService } from '@electron/services/workspace/workspaceTreeQuery'
import type {
  WorkspaceTreeChildrenRequest,
  WorkspaceTreeDeltaEvent,
  WorkspaceTreeExistenceRequest,
} from '@/types/workspaceTree'

export class WorkspaceTreeProjection {
  private readonly changedPaths = new Set<string>()
  private readonly explicitRenames: Array<{ from: string; to: string }> = []
  private readonly listeners = new Set<(event: WorkspaceTreeDeltaEvent) => void>()
  private readonly tracker = new WorkspaceTreeDeltaTracker()
  private generation = 0
  private readonly queries: WorkspaceTreeQueryService

  constructor(
    private readonly getEntries: () => Promise<FsEntry[]>,
    getRoot: () => FsRootInfo,
  ) {
    this.queries = new WorkspaceTreeQueryService({
      getEntries: async () => {
        const entries = await this.getEntries()
        if (!this.tracker.hasBaseline) this.tracker.observe(entries, getRoot())
        return entries
      },
      getGeneration: () => this.generation,
      getRevision: () => this.tracker.revision,
      getRoot,
    })
  }

  onChanged(listener: (event: WorkspaceTreeDeltaEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  listChildren(value: unknown) {
    return this.queries.listChildren(value as WorkspaceTreeChildrenRequest)
  }

  pathsExist(value: unknown) {
    return this.queries.pathsExist(value as WorkspaceTreeExistenceRequest)
  }

  initialFile() {
    return this.queries.initialFile()
  }

  search(value: unknown) {
    return this.queries.search(value as Parameters<WorkspaceTreeQueryService['search']>[0])
  }

  invalidateQueries(): void {
    this.queries.invalidate()
  }

  commitRoot(): void {
    this.generation += 1
    this.queries.invalidate()
  }

  recordChangedPath(path: string | null | undefined): void {
    if (path) this.changedPaths.add(path)
  }

  recordRename(from: string, to: string): void {
    this.explicitRenames.push({ from, to })
  }

  advance(root: FsRootInfo, entries: FsEntry[]): void {
    const event = this.tracker.advance(
      root,
      entries,
      [...this.changedPaths],
      this.explicitRenames.splice(0),
      this.generation,
    )
    this.changedPaths.clear()
    this.explicitRenames.length = 0
    for (const listener of this.listeners) listener(event)
  }

  dispose(): void {
    this.changedPaths.clear()
    this.listeners.clear()
  }
}
