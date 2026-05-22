import fs from 'node:fs'
import path from 'node:path'
import type { App, Shell } from 'electron'

import { noopLogger, type Logger } from '@electron/services/logger.js'
import { parseMarkdownDocument } from '@electron/services/workspace/markdown.js'
import {
  resolveWorkspacePath,
  toWorkspaceRelative,
  workspaceRootForAssets,
} from '@electron/services/workspace/path.js'
import type {
  BackgroundTaskStatus,
  FsBufferStatus,
  FsEntry,
  FsRootInfo,
  FsSnapshot,
  FsStateData,
  FsWorkspaceIndex,
} from '@electron/services/workspace/types.js'
import { WorkspaceBufferStore } from '@electron/services/workspace/workspaceBuffers.js'
import { loadWorkspaceDocuments } from '@electron/services/workspace/workspaceDocumentLoader.js'
import {
  runSearchIndexTask as runSearchIndexTaskWithStatus,
  runWorkerTask as runWorkerTaskWithFallback,
  type SearchIndexTaskState,
} from '@electron/services/workspace/workspaceTaskUtils.js'
import {
  ensureDefaultFile,
  errorMessage,
  listWorkspaceEntries,
  listWorkspaceKnownPaths,
  samePath,
  type WatchEventName,
} from '@electron/services/workspace/workspaceUtils.js'
import { WorkspaceWatcher } from '@electron/services/workspace/workspaceWatcher.js'

type SnapshotListener = (snapshot: FsSnapshot) => void

const WATCH_DEBOUNCE_MS = 250
const WORKSPACE_DOCUMENT_READ_BATCH_SIZE = 8

export class WorkspaceBase {
  protected readonly buffers: WorkspaceBufferStore
  protected readonly tasks = new Map<string, BackgroundTaskStatus>()
  protected readonly snapshotListeners = new Set<SnapshotListener>()
  protected readonly watcher: WorkspaceWatcher
  protected readonly searchIndexTaskState: SearchIndexTaskState = { runs: 0 }
  protected snapshotTimer: ReturnType<typeof setTimeout> | null = null
  protected pendingSnapshotWatcherRestart = false
  protected disposed = false
  protected state: FsStateData

  constructor(
    protected readonly app: App,
    protected readonly shell: Shell,
    protected readonly logger: Logger = noopLogger,
  ) {
    const internalRoot = path.join(app.getPath('userData'), 'workspace')
    this.state = {
      rootKind: 'internal',
      rootPath: internalRoot,
      internalRoot,
      singleFile: null,
    }
    fs.mkdirSync(internalRoot, { recursive: true })
    ensureDefaultFile(internalRoot)
    this.initializeBackgroundTasks()
    this.watcher = new WorkspaceWatcher({
      getState: () => this.state,
      logger: this.logger.child('watcher'),
      onChanged: (absolutePath, event) => this.handleWatchedPathChanged(absolutePath, event),
      setStatus: (status, message) => this.setTask('watcher', 'Workspace watcher', status, message),
    })
    this.buffers = new WorkspaceBufferStore({
      logger: this.logger.child('buffers'),
      resolvePath: (relativePath) => this.resolve(relativePath),
      markOwnWrite: (absolutePath) => this.watcher.markOwnWrite(absolutePath),
      onBuffersFlushed: (relativePaths) => this.onBuffersFlushed(relativePaths),
      scheduleSnapshotChanged: () => this.scheduleSnapshotChanged(),
      setTask: (id, label, status, message) => this.setTask(id, label, status, message),
      errorMessage,
    })
    this.logger.info('workspace service initialized', {
      rootKind: this.state.rootKind,
      rootPath: this.state.rootPath,
    })
    this.watcher.restart()
    app.on('will-quit', () => this.dispose())
  }

  rootInfo(): FsRootInfo {
    return { kind: this.state.rootKind, path: this.state.rootPath }
  }

  async entries(): Promise<FsEntry[]> {
    return this.listEntries()
  }

  getBackgroundTasks(): BackgroundTaskStatus[] {
    this.buffers.updateFlushIdleTask()
    return [...this.tasks.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  onBufferStatus(listener: (status: FsBufferStatus) => void): () => void {
    return this.buffers.onStatus(listener)
  }

  onSnapshotChanged(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener)
    return () => {
      this.snapshotListeners.delete(listener)
    }
  }

  dispose(): void {
    this.disposed = true
    this.logger.info('workspace service disposing')
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer)
      this.snapshotTimer = null
    }
    this.watcher.dispose()
    this.buffers.dispose()
    this.snapshotListeners.clear()
  }

  protected async buildWorkspaceIndex(): Promise<FsWorkspaceIndex> {
    const documents = await this.workspaceDocuments()
    const knownPaths = await this.workspaceKnownPaths()
    return {
      files: documents.map((document) => parseMarkdownDocument(document.path, document.content)),
      paths: knownPaths.paths,
      asset_paths: knownPaths.assetPaths,
    }
  }

  protected async listEntries(): Promise<FsEntry[]> {
    return listWorkspaceEntries(this.state)
  }

  protected async workspaceDocuments(
    replacePath?: string,
    replaceContent?: string,
  ): Promise<Array<{ path: string; content: string }>> {
    return loadWorkspaceDocuments({
      batchSize: WORKSPACE_DOCUMENT_READ_BATCH_SIZE,
      entries: await this.listEntries(),
      readFile: (entryPath) => this.readFile({ path: entryPath }),
      replaceContent,
      replacePath,
    })
  }

  protected async workspaceKnownPaths(): Promise<{ paths: string[]; assetPaths: string[] }> {
    return listWorkspaceKnownPaths(this.state)
  }

  protected readFile(value: unknown): Promise<string> {
    void value
    throw new Error('WorkspaceBase.readFile must be implemented by a subclass')
  }

  protected resolve(relativePath: string): string {
    return resolveWorkspacePath(this.state, relativePath)
  }

  protected ensureWorkspaceMode(): void {
    if (this.state.rootKind === 'single') {
      throw new Error('Operation is not supported in single-file mode')
    }
  }

  protected runSearchIndexTask<T>(
    work: () => Promise<T>,
    fallback: (() => Promise<T> | T) | null = null,
    taskName = 'search-index',
  ): Promise<T> {
    return runSearchIndexTaskWithStatus({
      fallback,
      getStatus: () => this.tasks.get('search-index')?.status,
      logger: this.logger,
      setTask: (id, label, status, message) => this.setTask(id, label, status, message),
      state: this.searchIndexTaskState,
      taskName,
      work,
    })
  }

  protected runWorkerTask<T>(
    task: () => Promise<T>,
    fallback: () => Promise<T> | T,
    taskName: string,
  ): Promise<T> {
    return runWorkerTaskWithFallback(task, fallback, taskName, this.logger)
  }

  protected onBuffersFlushed(relativePaths: string[]): void {
    void relativePaths
  }

  protected scheduleSnapshotChanged(options?: { restartWatcher?: boolean }): void {
    if (this.disposed) return
    this.pendingSnapshotWatcherRestart =
      this.pendingSnapshotWatcherRestart || Boolean(options?.restartWatcher)
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null
      void this.emitSnapshotChanged()
    }, WATCH_DEBOUNCE_MS)
  }

  protected setTask(
    id: string,
    label: string,
    status: BackgroundTaskStatus['status'],
    message: string | null,
  ): void {
    this.tasks.set(id, { id, label, status, message })
  }

  private initializeBackgroundTasks(): void {
    this.setTask('search-index', 'Search index', 'idle', null)
    this.setTask('buffer-flush', 'Save queue', 'idle', null)
    this.setTask('watcher', 'Workspace watcher', 'idle', null)
  }

  private async emitSnapshotChanged(): Promise<void> {
    if (this.disposed) return
    const shouldRestartWatcher = this.pendingSnapshotWatcherRestart
    this.pendingSnapshotWatcherRestart = false
    try {
      const snapshot = await this.snapshot()
      if (shouldRestartWatcher) this.watcher.restart()
      for (const listener of this.snapshotListeners) listener(snapshot)
    } catch (emitError) {
      this.logger.warn('workspace snapshot changed event failed', { error: emitError })
      if (shouldRestartWatcher) this.watcher.restart()
    }
  }

  async snapshot(): Promise<FsSnapshot> {
    return { root: this.rootInfo(), entries: await this.listEntries() }
  }

  protected onWorkspacePathChanged(_changedPath: string | null, _event?: WatchEventName): void {
    void _changedPath
    void _event
  }

  protected handleWatchedPathChanged(changedPath: string | null, event?: WatchEventName): void {
    if (this.state.rootKind === 'single') {
      if (changedPath && !this.isCurrentSingleFile(changedPath)) return
      if (changedPath) {
        this.invalidateCleanBuffersForAbsolutePaths([changedPath])
      } else {
        this.invalidateCurrentSingleFileBuffer()
      }
      this.scheduleSnapshotChanged()
      this.onWorkspacePathChanged(changedPath ? path.basename(changedPath) : null, event)
      return
    }

    if (changedPath) {
      this.invalidateCleanBuffersForAbsolutePaths([changedPath])
    } else {
      this.buffers.invalidateAllClean()
    }
    const relativePath = changedPath
      ? toWorkspaceRelative(workspaceRootForAssets(this.state), changedPath)
      : null
    this.onWorkspacePathChanged(relativePath, event)
    this.scheduleSnapshotChanged()
  }

  private invalidateCurrentSingleFileBuffer(): void {
    const singleFile = this.state.singleFile
    if (!singleFile) return
    this.buffers.invalidateCleanForRelativePaths([path.basename(singleFile)])
  }

  private invalidateCleanBuffersForAbsolutePaths(absolutePaths: string[]): void {
    const relativePaths: string[] = []
    for (const absolutePath of absolutePaths) {
      const relativePath = toWorkspaceRelative(workspaceRootForAssets(this.state), absolutePath)
      if (relativePath) relativePaths.push(relativePath)
    }
    this.buffers.invalidateCleanForRelativePaths(relativePaths)
  }

  private isCurrentSingleFile(absolutePath: string): boolean {
    return Boolean(this.state.singleFile && samePath(this.state.singleFile, absolutePath))
  }
}
