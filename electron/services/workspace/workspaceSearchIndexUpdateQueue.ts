import { isSearchIndexablePath } from '@electron/services/workspace/path'
import type { Logger } from '@electron/services/logger'
import type { WatchEventName } from '@electron/services/workspace/workspaceUtils'
import { Subject, type Subscription, switchMap, takeUntil, timer } from 'rxjs'

type SearchIndexChangeKind = 'remove-file' | 'remove-prefix' | 'upsert'

type SearchIndexChange = {
  kind: SearchIndexChangeKind
  path: string
}

type WorkspaceSearchIndexUpdateQueueOptions<TDocument> = {
  applyChanges: (changes: {
    removeDocuments: string[]
    removePrefixes: string[]
    upserts: TDocument[]
  }) => Promise<void>
  delayMs: number
  getDocumentPath: (document: TDocument) => string
  loadDocuments: (paths: string[]) => Promise<TDocument[]>
  logger: Logger
  openIndex: () => Promise<void>
  rebuildAll: () => Promise<void>
  runTask: <T>(work: () => Promise<T>, taskName: string) => Promise<T>
}

export class WorkspaceSearchIndexUpdateQueue<TDocument> {
  private readonly changes = new Map<string, SearchIndexChangeKind>()
  private readonly flushCancelRequests = new Subject<void>()
  private readonly flushRequests = new Subject<void>()
  private readonly flushSubscription: Subscription
  private flushQueue: Promise<void> = Promise.resolve()
  private rebuildScheduled = false
  private disposed = false

  constructor(private readonly options: WorkspaceSearchIndexUpdateQueueOptions<TDocument>) {
    this.flushSubscription = this.flushRequests
      .pipe(switchMap(() => timer(this.options.delayMs).pipe(takeUntil(this.flushCancelRequests))))
      .subscribe({
        next: () => {
          void this.flush().catch((error) => {
            this.options.logger.warn('search index update queue failed', { error })
          })
        },
      })
  }

  clear(): void {
    this.changes.clear()
    this.rebuildScheduled = false
    this.flushCancelRequests.next()
  }

  dispose(): void {
    if (this.disposed) return
    this.clear()
    this.disposed = true
    this.flushSubscription.unsubscribe()
    this.flushRequests.complete()
    this.flushCancelRequests.complete()
  }

  scheduleFullRebuild(): void {
    this.rebuildScheduled = true
    this.changes.clear()
    this.scheduleFlush()
  }

  async flushPending(): Promise<void> {
    this.flushCancelRequests.next()
    if (!this.rebuildScheduled && this.changes.size === 0) {
      await this.flushQueue
      return
    }
    await this.flush()
  }

  schedulePathChange(changedPath: string | null, event?: WatchEventName): boolean {
    if (!changedPath || !event) {
      this.scheduleFullRebuild()
      return true
    }

    if (event === 'addDir') return false
    if (event === 'unlinkDir') {
      this.queueChange(changedPath, 'remove-prefix')
      return true
    }
    if (!isSearchIndexablePath(changedPath)) return false
    if (event === 'unlink') {
      this.queueChange(changedPath, 'remove-file')
      return true
    }
    if (event === 'add' || event === 'change') {
      this.queueChange(changedPath, 'upsert')
      return true
    }
    return false
  }

  private queueChange(changedPath: string, kind: SearchIndexChangeKind): void {
    if (this.rebuildScheduled) return
    if (kind === 'remove-prefix') {
      for (const path of this.changes.keys()) {
        if (path === changedPath || path.startsWith(`${changedPath}/`)) this.changes.delete(path)
      }
    }
    this.changes.set(changedPath, kind)
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.disposed) return
    this.flushRequests.next()
  }

  private async flush(): Promise<void> {
    const operation = this.flushQueue.then(() => this.flushOnce())
    this.flushQueue = operation.catch(() => undefined)
    return operation
  }

  private async flushOnce(): Promise<void> {
    if (!this.rebuildScheduled && this.changes.size === 0) return
    const shouldRebuild = this.rebuildScheduled
    const changes = [...this.changes.entries()].map(([path, kind]) => ({ kind, path }))
    this.rebuildScheduled = false
    this.changes.clear()

    try {
      await this.options.runTask(async () => {
        await this.options.openIndex()
        if (shouldRebuild) {
          await this.options.rebuildAll()
          return
        }
        await this.applyChanges(changes)
      }, 'search-index')
    } catch (error) {
      this.restoreFailedChanges(shouldRebuild, changes)
      throw error
    }
  }

  private async applyChanges(changes: SearchIndexChange[]): Promise<void> {
    const upsertPaths: string[] = []
    const removeDocuments: string[] = []
    const removePrefixes: string[] = []
    for (const change of changes) {
      if (change.kind === 'upsert') {
        upsertPaths.push(change.path)
      } else if (change.kind === 'remove-file') {
        removeDocuments.push(change.path)
      } else {
        removePrefixes.push(change.path)
      }
    }

    const documents = await this.options.loadDocuments(upsertPaths)
    const loadedPaths = new Set(documents.map(this.options.getDocumentPath))
    for (const upsertPath of upsertPaths) {
      if (!loadedPaths.has(upsertPath)) removeDocuments.push(upsertPath)
    }
    await this.options.applyChanges({ removeDocuments, removePrefixes, upserts: documents })
  }

  private restoreFailedChanges(shouldRebuild: boolean, changes: SearchIndexChange[]): void {
    if (this.disposed) return
    if (shouldRebuild) {
      this.rebuildScheduled = true
      this.changes.clear()
    } else {
      for (const change of changes) {
        if (!this.changes.has(change.path)) this.changes.set(change.path, change.kind)
      }
    }
    this.scheduleFlush()
  }
}
