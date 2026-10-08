import type { Logger } from '@electron/services/logger'
import { isSearchIndexablePath } from '@electron/services/workspace/path'
import type { FsStateData } from '@electron/services/workspace/types'
import { loadWorkspaceSearchDocuments } from '@electron/services/workspace/workspaceSearchDocumentLoader'
import { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex'
import { rebuildWorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndexBuilder'
import { WorkspaceSearchIndexBuildCoordinator } from '@electron/services/workspace/workspaceSearchIndexBuildCoordinator'
import {
  workspaceChangeAffectsSearch,
  workspaceSearchIndexPath,
  workspaceSearchKey,
} from '@electron/services/workspace/workspaceSearchIndexLifecycle'
import { WorkspaceSearchIndexUpdateQueue } from '@electron/services/workspace/workspaceSearchIndexUpdateQueue'
import { WorkspaceSearchOperations } from '@electron/services/workspace/workspaceSearchOperations'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'
import type { WatchEventName } from '@electron/services/workspace/workspaceUtils'

const SEARCH_INDEX_REBUILD_DELAY_MS = 600

type WorkspaceSearchIndexRuntimeOptions = {
  getState: () => FsStateData
  getUserDataPath: () => string
  index: WorkspaceSearchIndex
  loadDocuments: (signal?: AbortSignal) => Promise<Array<{ content: string; path: string }>>
  logger: Logger
  readFile: (path: string) => Promise<string>
  runTask: <T>(work: () => Promise<T>, name: string) => Promise<T>
}

export class WorkspaceSearchIndexRuntime {
  private activeSearchKey = ''
  private readonly buildCoordinator = new WorkspaceSearchIndexBuildCoordinator()
  private needsRebuild = true
  private readonly operations: WorkspaceSearchOperations
  private readonly updateQueue: WorkspaceSearchIndexUpdateQueue<WorkspaceSearchDocument>

  constructor(private readonly options: WorkspaceSearchIndexRuntimeOptions) {
    this.operations = new WorkspaceSearchOperations({
      activeSearchKey: () => this.activeSearchKey,
      index: options.index,
      logger: options.logger,
      prepare: () => this.prepare(),
      runTask: options.runTask,
    })
    this.updateQueue = new WorkspaceSearchIndexUpdateQueue({
      applyChanges: async (changes, signal) => {
        signal?.throwIfAborted()
        await options.index.applySearchChanges(changes)
        signal?.throwIfAborted()
      },
      delayMs: SEARCH_INDEX_REBUILD_DELAY_MS,
      getDocumentPath: (document) => document.path,
      loadDocuments: (paths, signal) =>
        loadWorkspaceSearchDocuments({
          concurrency: 8,
          logger: options.logger,
          paths,
          readFile: options.readFile,
          signal,
        }),
      logger: options.logger.child('search-index-updates'),
      openIndex: (signal) => this.open(signal),
      rebuildAll: async (signal) => {
        if (await this.build(signal)) this.needsRebuild = false
      },
      runTask: options.runTask,
    })
  }

  search(value: unknown) {
    return this.operations.search(value)
  }

  searchOccurrences(value: unknown) {
    return this.operations.searchOccurrences(value)
  }

  cancelOccurrenceSearch(value: unknown) {
    return this.operations.cancelOccurrenceSearch(value)
  }

  async rebuild(): Promise<void> {
    await this.open()
    this.needsRebuild = true
    if (await this.build()) this.needsRebuild = false
  }

  reset(): void {
    this.buildCoordinator.invalidate()
    this.updateQueue.clear()
    this.activeSearchKey = ''
    this.needsRebuild = true
    void this.options.index.close().catch((error) => {
      this.options.logger.warn('search index close failed while switching workspace', { error })
    })
  }

  onWorkspacePathChanged(changedPath: string | null, event?: WatchEventName): void {
    if (!workspaceChangeAffectsSearch(changedPath, event)) return
    if (this.activeSearchKey && !this.needsRebuild) {
      this.updateQueue.schedulePathChange(changedPath, event)
      return
    }
    this.needsRebuild = true
    this.updateQueue.scheduleFullRebuild()
  }

  onBuffersFlushed(relativePaths: string[]): void {
    const markdownPaths = relativePaths.filter((value) => isSearchIndexablePath(value))
    for (const relativePath of markdownPaths) {
      this.updateQueue.schedulePathChange(relativePath, 'change')
    }
  }

  dispose(): void {
    this.operations.dispose()
    this.buildCoordinator.invalidate()
    this.updateQueue.dispose()
    void this.options.index.close().catch((error) => {
      this.options.logger.warn('search index close failed during disposal', { error })
    })
  }

  private async open(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    const searchKey = workspaceSearchKey(this.options.getState())
    const indexPath = workspaceSearchIndexPath(this.options.getUserDataPath(), searchKey)
    await this.options.index.open(indexPath, searchKey, signal)
    signal?.throwIfAborted()
    if (this.activeSearchKey === searchKey) return

    this.activeSearchKey = searchKey
    const hasDocuments = await this.options.index.hasDocuments()
    this.needsRebuild = !hasDocuments
    this.options.logger.info('workspace search index opened', {
      hasDocuments,
      searchKey: searchKey.slice(0, 12),
    })
  }

  private async prepare(): Promise<void> {
    await this.open()
    await this.updateQueue.flushPending()
    if (this.needsRebuild && (await this.build())) this.needsRebuild = false
  }

  private build(signal?: AbortSignal): Promise<boolean> {
    return rebuildWorkspaceSearchIndex({
      coordinator: this.buildCoordinator,
      currentSearchKey: () => workspaceSearchKey(this.options.getState()),
      index: this.options.index,
      loadDocuments: this.options.loadDocuments,
      logger: this.options.logger,
      signal,
    })
  }
}
