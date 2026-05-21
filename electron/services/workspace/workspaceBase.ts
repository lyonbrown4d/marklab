import fs from 'node:fs'
import path from 'node:path'
import type { App, Shell } from 'electron'

import { parseMarkdownDocument } from './markdown.js'
import { resolveWorkspacePath, toWorkspaceRelative, workspaceRootForAssets } from './path.js'
import type {
  BackgroundTaskStatus,
  FsBufferStatus,
  FsEntry,
  FsRootInfo,
  FsSnapshot,
  FsStateData,
  FsWorkspaceIndex,
} from './types.js'
import { WorkspaceBufferStore } from './workspaceBuffers.js'
import {
  ensureDefaultFile,
  errorMessage,
  listWorkspaceEntries,
  listWorkspaceKnownPaths,
  samePath,
} from './workspaceUtils.js'
import { WorkspaceWatcher } from './workspaceWatcher.js'

type SnapshotListener = (snapshot: FsSnapshot) => void

const WATCH_DEBOUNCE_MS = 250

export class WorkspaceBase {
  protected readonly buffers: WorkspaceBufferStore
  protected readonly tasks = new Map<string, BackgroundTaskStatus>()
  protected readonly snapshotListeners = new Set<SnapshotListener>()
  protected readonly watcher: WorkspaceWatcher
  protected snapshotTimer: ReturnType<typeof setTimeout> | null = null
  protected pendingSnapshotWatcherRestart = false
  protected searchIndexRuns = 0
  protected disposed = false
  protected state: FsStateData

  constructor(
    app: App,
    protected readonly shell: Shell,
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
      onChanged: (absolutePath) => this.handleWatchedPathChanged(absolutePath),
      setStatus: (status, message) => this.setTask('watcher', 'Workspace watcher', status, message),
    })
    this.buffers = new WorkspaceBufferStore({
      resolvePath: (relativePath) => this.resolve(relativePath),
      markOwnWrite: (absolutePath) => this.watcher.markOwnWrite(absolutePath),
      scheduleSnapshotChanged: () => this.scheduleSnapshotChanged(),
      setTask: (id, label, status, message) => this.setTask(id, label, status, message),
      errorMessage,
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
    const entries = (await this.listEntries()).filter((entry) => entry.kind === 'file')
    const documents: Array<{ path: string; content: string }> = []
    for (const entry of entries) {
      if (entry.path === replacePath && replaceContent != null) {
        documents.push({ path: entry.path, content: replaceContent })
        continue
      }
      documents.push({ path: entry.path, content: await this.readFile({ path: entry.path }) })
    }
    return documents
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

  protected runSearchIndexTask<T>(work: () => Promise<T>): Promise<T> {
    this.searchIndexRuns += 1
    this.setTask('search-index', 'Search index', 'running', null)
    return work()
      .catch((taskError: unknown) => {
        this.setTask('search-index', 'Search index', 'error', errorMessage(taskError))
        throw taskError
      })
      .finally(() => {
        this.searchIndexRuns -= 1
        if (this.searchIndexRuns === 0 && this.tasks.get('search-index')?.status !== 'error') {
          this.setTask('search-index', 'Search index', 'idle', null)
        }
      })
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
      console.warn('workspace snapshot changed event failed', emitError)
      if (shouldRestartWatcher) this.watcher.restart()
    }
  }

  async snapshot(): Promise<FsSnapshot> {
    return { root: this.rootInfo(), entries: await this.listEntries() }
  }

  private handleWatchedPathChanged(changedPath: string | null): void {
    if (this.state.rootKind === 'single') {
      if (changedPath && !this.isCurrentSingleFile(changedPath)) return
      if (changedPath) {
        this.invalidateCleanBuffersForAbsolutePaths([changedPath])
      } else {
        this.invalidateCurrentSingleFileBuffer()
      }
      this.scheduleSnapshotChanged()
      return
    }

    if (changedPath) {
      this.invalidateCleanBuffersForAbsolutePaths([changedPath])
    } else {
      this.buffers.invalidateAllClean()
    }
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
