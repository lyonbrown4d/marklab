import fs from 'node:fs'
import path from 'node:path'
import type { App, Shell } from 'electron'

import { noopLogger, type Logger } from '@electron/services/logger'
import { resolveWorkspacePath } from '@electron/services/workspace/path'
import {
  currentSingleFileName,
  isCurrentSingleFilePath,
  relativePathsForAbsolutePaths,
} from '@electron/services/workspace/workspacePathInvalidation'
import type {
  BackgroundTaskStatus,
  FsBufferStatus,
  FsEntry,
  FsRootInfo,
  FsSnapshot,
  FsStateData,
} from '@electron/services/workspace/types'
import {
  type WorkspaceBufferWriteFile,
  WorkspaceBufferStore,
} from '@electron/services/workspace/workspaceBuffers'
import type { WorkspaceDocument } from '@electron/services/workspace/workspaceDocumentLoader'
import { WorkspaceDocumentCatalog } from '@electron/services/workspace/workspaceDocumentCatalog'
import {
  initializeWorkspaceBackgroundTasks,
  runSearchIndexTask as runSearchIndexTaskWithStatus,
  runWorkerTask as runWorkerTaskRequired,
  type SearchIndexTaskState,
} from '@electron/services/workspace/workspaceTaskUtils'
import {
  ensureDefaultFile,
  errorMessage,
  type WorkspaceKnownPaths,
  type WatchEventName,
} from '@electron/services/workspace/workspaceUtils'
import {
  createWorkspacePathSnapshotCache,
  type WorkspacePathSnapshotCache,
} from '@electron/services/workspace/workspacePathSnapshotCache'
import { WorkspaceWatcher } from '@electron/services/workspace/workspaceWatcher'
import { WorkspaceTreeProjection } from '@electron/services/workspace/workspaceTreeProjection'
import type { WorkspaceTreeDeltaEvent } from '@/types/workspaceTree'

type SnapshotListener = (snapshot: FsSnapshot) => void
type BackgroundTasksListener = (tasks: BackgroundTaskStatus[]) => void

const WATCH_DEBOUNCE_MS = 250

export class WorkspaceBase {
  protected readonly buffers: WorkspaceBufferStore
  protected readonly tasks = new Map<string, BackgroundTaskStatus>()
  protected readonly snapshotListeners = new Set<SnapshotListener>()
  protected readonly backgroundTasksListeners = new Set<BackgroundTasksListener>()
  protected readonly watcher: WorkspaceWatcher
  protected readonly pathSnapshots: WorkspacePathSnapshotCache
  protected readonly documents: WorkspaceDocumentCatalog
  protected readonly tree: WorkspaceTreeProjection
  protected readonly searchIndexTaskState: SearchIndexTaskState = { runs: 0 }
  protected readonly disposeOnWillQuit = () => this.dispose()
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
    this.pathSnapshots = createWorkspacePathSnapshotCache(() => this.state, this.logger)
    this.documents = new WorkspaceDocumentCatalog(
      () => this.pathSnapshots.get(),
      (entryPath) => this.readFileForAnalysis(entryPath),
    )
    this.tree = new WorkspaceTreeProjection(
      () => this.listEntries(),
      () => this.rootInfo(),
    )
    initializeWorkspaceBackgroundTasks((id, label, status, message) =>
      this.setTask(id, label, status, message),
    )
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
      writeFile: (args) => this.writeBufferedFile(args),
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
    app.on('will-quit', this.disposeOnWillQuit)
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

  hasDirtyBuffers(): boolean {
    return this.buffers.getBackgroundDirtyCount() > 0
  }

  onBackgroundTasksChanged(listener: BackgroundTasksListener): () => void {
    this.backgroundTasksListeners.add(listener)
    listener(this.getBackgroundTasks())
    return () => {
      this.backgroundTasksListeners.delete(listener)
    }
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

  onTreeChanged(listener: (event: WorkspaceTreeDeltaEvent) => void): () => void {
    return this.tree.onChanged(listener)
  }

  listTreeChildren = (value: unknown) => this.tree.listChildren(value)

  treePathsExist = (value: unknown) => this.tree.pathsExist(value)

  initialTreeFile = () => this.tree.initialFile()

  searchTree = (value: unknown) => this.tree.search(value)

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.app.removeListener('will-quit', this.disposeOnWillQuit)
    this.logger.info('workspace service disposing')
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer)
      this.snapshotTimer = null
    }
    this.watcher.dispose()
    this.buffers.dispose()
    this.snapshotListeners.clear()
    this.tree.dispose()
    this.backgroundTasksListeners.clear()
  }

  protected async listEntries(): Promise<FsEntry[]> {
    return (await this.pathSnapshots.get()).entries
  }

  protected async workspaceDocuments(
    replacePath?: string,
    replaceContent?: string,
  ): Promise<WorkspaceDocument[]> {
    return this.documents.documents(replacePath, replaceContent)
  }

  protected readonly workspaceDocumentsAndKnownPaths = async (
    replacePath?: string,
    replaceContent?: string,
  ): Promise<{ documents: WorkspaceDocument[]; knownPaths: WorkspaceKnownPaths }> =>
    this.documents.documentsAndKnownPaths(replacePath, replaceContent)

  protected readFile(value: unknown): Promise<string> {
    void value
    throw new Error('WorkspaceBase.readFile must be implemented by a subclass')
  }

  protected readFileForAnalysis = (relativePath: string) => this.readFile({ path: relativePath })

  protected resolve(relativePath: string): string {
    return resolveWorkspacePath(this.state, relativePath)
  }

  protected ensureWorkspaceMode(): void {
    if (this.state.rootKind === 'single') {
      throw new Error('Operation is not supported in single-file mode')
    }
  }

  protected runSearchIndexTask<T>(work: () => Promise<T>, taskName = 'search-index'): Promise<T> {
    return runSearchIndexTaskWithStatus({
      getStatus: () => this.tasks.get('search-index')?.status,
      logger: this.logger,
      setTask: (id, label, status, message) => this.setTask(id, label, status, message),
      state: this.searchIndexTaskState,
      taskName,
      work,
    })
  }

  protected runWorkerTask<T>(task: () => Promise<T>, taskName: string): Promise<T> {
    return runWorkerTaskRequired(task, taskName, this.logger)
  }

  protected writeBufferedFile(args: Parameters<WorkspaceBufferWriteFile>[0]): Promise<void> {
    return args.writeWithNode()
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
    const current = this.tasks.get(id)
    if (
      current &&
      current.label === label &&
      current.status === status &&
      current.message === message
    ) {
      return
    }

    this.tasks.set(id, { id, label, status, message })
    this.emitBackgroundTasksChanged()
  }

  private emitBackgroundTasksChanged(): void {
    const tasks = [...this.tasks.values()].sort((left, right) => left.id.localeCompare(right.id))
    for (const listener of this.backgroundTasksListeners) listener(tasks)
  }

  private async emitSnapshotChanged(): Promise<void> {
    if (this.disposed) return
    const shouldRestartWatcher = this.pendingSnapshotWatcherRestart
    this.pendingSnapshotWatcherRestart = false
    try {
      const snapshot = await this.snapshot()
      this.tree.advance(snapshot.root, snapshot.entries)
      if (shouldRestartWatcher) this.watcher.restart()
      for (const listener of this.snapshotListeners) listener(snapshot)
    } catch (emitError) {
      this.logger.warn('workspace snapshot changed event failed', { error: emitError })
      if (shouldRestartWatcher) this.watcher.restart()
    }
  }

  async snapshot(): Promise<FsSnapshot> {
    const entries = await this.listEntries()
    return { root: this.rootInfo(), entries }
  }

  protected onWorkspacePathChanged(_changedPath: string | null, _event?: WatchEventName): void {
    void _changedPath
    void _event
  }

  protected handleWatchedPathChanged(changedPath: string | null, event?: WatchEventName): void {
    if (!event || event !== 'change') {
      this.pathSnapshots.invalidate()
      this.tree.invalidateQueries()
    }
    if (this.state.rootKind === 'single') {
      if (changedPath && !isCurrentSingleFilePath(this.state, changedPath)) return
      if (changedPath) {
        this.invalidateCleanBuffers([changedPath])
      } else {
        const singleFileName = currentSingleFileName(this.state)
        if (singleFileName) this.buffers.invalidateCleanForRelativePaths([singleFileName])
      }
      if (event === 'change') {
        const singleFileName = currentSingleFileName(this.state)
        this.tree.recordChangedPath(singleFileName)
      }
      this.scheduleSnapshotChanged()
      this.onWorkspacePathChanged(changedPath ? path.basename(changedPath) : null, event)
      return
    }

    if (changedPath) {
      this.invalidateCleanBuffers([changedPath])
    } else {
      this.buffers.invalidateAllClean()
    }
    const relativePath = changedPath
      ? relativePathsForAbsolutePaths(this.state, [changedPath])[0]
      : null
    if (event === 'change') this.tree.recordChangedPath(relativePath)
    this.onWorkspacePathChanged(relativePath, event)
    this.scheduleSnapshotChanged()
  }

  private invalidateCleanBuffers(absolutePaths: string[]): void {
    this.buffers.invalidateCleanForRelativePaths(
      relativePathsForAbsolutePaths(this.state, absolutePaths),
    )
  }
}
