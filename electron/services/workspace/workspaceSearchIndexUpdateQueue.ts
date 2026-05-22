import { isMarkdownPath } from '@electron/services/workspace/path.js'
import type { Logger } from '@electron/services/logger.js'
import type { WatchEventName } from '@electron/services/workspace/workspaceUtils.js'

type SearchIndexChangeKind = 'remove-file' | 'remove-prefix' | 'upsert'

type SearchIndexChange = {
  kind: SearchIndexChangeKind
  path: string
}

type WorkspaceSearchIndexUpdateQueueOptions<TDocument> = {
  delayMs: number
  loadDocuments: (paths: string[]) => Promise<TDocument[]>
  logger: Logger
  markNeedsRebuild: () => void
  openIndex: () => Promise<void>
  rebuildAll: () => Promise<void>
  removeDocument: (path: string) => Promise<void>
  removePathPrefix: (path: string) => Promise<void>
  runTask: <T>(
    work: () => Promise<T>,
    fallback: (() => Promise<T> | T) | null,
    taskName: string,
  ) => Promise<T>
  upsertDocument: (document: TDocument) => Promise<void>
}

export class WorkspaceSearchIndexUpdateQueue<TDocument> {
  private readonly changes = new Map<string, SearchIndexChangeKind>()
  private rebuildScheduled = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: WorkspaceSearchIndexUpdateQueueOptions<TDocument>) {}

  clear(): void {
    this.changes.clear()
    this.rebuildScheduled = false
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
  }

  dispose(): void {
    this.clear()
  }

  scheduleFullRebuild(): void {
    this.rebuildScheduled = true
    this.changes.clear()
    this.scheduleFlush()
  }

  async flushPending(): Promise<void> {
    if (!this.rebuildScheduled && this.changes.size === 0) return
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
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
    if (!isMarkdownPath(changedPath)) return false
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
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush().catch((error) => {
        this.options.logger.warn('search index update queue failed', { error })
      })
    }, this.options.delayMs)
  }

  private async flush(): Promise<void> {
    const shouldRebuild = this.rebuildScheduled
    const changes = [...this.changes.entries()].map(([path, kind]) => ({ kind, path }))
    this.rebuildScheduled = false
    this.changes.clear()

    await this.options.runTask(
      async () => {
        await this.options.openIndex()
        if (shouldRebuild) {
          await this.options.rebuildAll()
          return
        }
        await this.applyChanges(changes)
      },
      async () => {
        this.options.markNeedsRebuild()
      },
      'search-index',
    )
  }

  private async applyChanges(changes: SearchIndexChange[]): Promise<void> {
    const upsertPaths: string[] = []
    for (const change of changes) {
      if (change.kind === 'upsert') {
        upsertPaths.push(change.path)
      } else if (change.kind === 'remove-file') {
        await this.options.removeDocument(change.path)
      } else {
        await this.options.removePathPrefix(change.path)
      }
    }

    const documents = await this.options.loadDocuments(upsertPaths)
    for (const document of documents) {
      await this.options.upsertDocument(document)
    }
  }
}
