import fs from 'node:fs'
import path from 'node:path'
import type { App, Shell } from 'electron'
import { watch, type FSWatcher } from 'chokidar'

import {
  buildOutlineGraph,
  buildWorkspaceGraph,
  diagnosticsForFile,
  guessMediaType,
  normalizeMarkdownTarget,
  parseMarkdownDocument,
  searchDocuments,
} from './markdown.js'
import {
  isExternalTarget,
  isMarkdownPath,
  normalizeRelativePath,
  resolveWorkspacePath,
  stripAssetQueryAndHash,
  toWorkspaceRelative,
  workspaceRootForAssets,
} from './path.js'
import type {
  BackgroundTaskStatus,
  FsBufferStatus,
  FsEntry,
  FsGraph,
  FsMarkdownAssetImportResult,
  FsMarkdownAssetResolveResult,
  FsMarkdownDiagnostic,
  FsPathMetadata,
  FsRootInfo,
  FsSnapshot,
  FsStateData,
  FsWorkspaceIndex,
} from './types.js'

type BufferRecord = {
  content: string
  dirty: boolean
  revision: number
}

type BufferStatusListener = (status: FsBufferStatus) => void
type SnapshotListener = (snapshot: FsSnapshot) => void
type WatchEventName = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'

const WATCH_DEBOUNCE_MS = 250
const BUFFER_AUTO_FLUSH_INTERVAL_MS = 3000
const OWN_WRITE_EVENT_SUPPRESS_MS = 1500

export class WorkspaceService {
  private readonly buffers = new Map<string, BufferRecord>()
  private readonly tasks = new Map<string, BackgroundTaskStatus>()
  private readonly bufferListeners = new Set<BufferStatusListener>()
  private readonly snapshotListeners = new Set<SnapshotListener>()
  private watcher: FSWatcher | null = null
  private readonly recentOwnWrites = new Map<string, number>()
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null
  private autoFlushTimer: ReturnType<typeof setInterval> | null = null
  private flushInFlight: Promise<number> | null = null
  private pendingSnapshotWatcherRestart = false
  private currentWatchRoot: string | null = null
  private ownWriteSuppressUntil = 0
  private searchIndexRuns = 0
  private watcherVersion = 0
  private disposed = false
  private state: FsStateData

  constructor(
    app: App,
    private readonly shell: Shell,
  ) {
    const internalRoot = path.join(app.getPath('userData'), 'workspace')
    this.state = {
      rootKind: 'internal',
      rootPath: internalRoot,
      internalRoot,
      singleFile: null,
    }
    fs.mkdirSync(internalRoot, { recursive: true })
    this.ensureDefaultFile(internalRoot)
    this.initializeBackgroundTasks()
    this.startAutoFlushWorker()
    this.restartWatcher()
    app.on('will-quit', () => this.dispose())
  }

  rootInfo(): FsRootInfo {
    return { kind: this.state.rootKind, path: this.state.rootPath }
  }

  async snapshot(): Promise<FsSnapshot> {
    return { root: this.rootInfo(), entries: await this.listEntries() }
  }

  async entries(): Promise<FsEntry[]> {
    return this.listEntries()
  }

  terminalCwd(): string {
    if (this.state.rootKind === 'single' && this.state.singleFile) {
      return path.dirname(this.state.singleFile)
    }
    return this.state.rootPath
  }

  isAssetPathAllowed(value: string): boolean {
    if (typeof value !== 'string' || !value || value.includes('\0')) return false
    const resolved = path.resolve(value)
    return isPathInsideOrEqual(workspaceRootForAssets(this.state), resolved)
  }

  async setRoot(value: unknown): Promise<FsRootInfo> {
    const rootPath = typeof value === 'object' && value && 'path' in value ? value.path : value
    if (rootPath != null && typeof rootPath !== 'string') {
      throw new Error('fs_set_root requires path to be a string or null')
    }

    if (rootPath) {
      const stat = await fs.promises.stat(rootPath).catch(() => null)
      if (!stat?.isDirectory()) throw new Error('Selected path is not a directory')
      this.state = {
        ...this.state,
        rootKind: 'external',
        rootPath: path.resolve(rootPath),
        singleFile: null,
      }
    } else {
      fs.mkdirSync(this.state.internalRoot, { recursive: true })
      this.ensureDefaultFile(this.state.internalRoot)
      this.state = {
        ...this.state,
        rootKind: 'internal',
        rootPath: this.state.internalRoot,
        singleFile: null,
      }
    }

    this.buffers.clear()
    this.restartWatcher()
    this.scheduleSnapshotChanged()
    return this.rootInfo()
  }

  async setSingleFile(value: unknown): Promise<FsRootInfo> {
    const filePath = stringArg(value, 'path')
    const stat = await fs.promises.stat(filePath).catch(() => null)
    if (!stat?.isFile()) throw new Error('Selected path is not a file')
    if (!isMarkdownPath(filePath)) throw new Error('Selected file is not a Markdown file')

    const resolved = path.resolve(filePath)
    this.state = {
      ...this.state,
      rootKind: 'single',
      rootPath: resolved,
      singleFile: resolved,
    }
    this.buffers.clear()
    this.restartWatcher()
    this.scheduleSnapshotChanged()
    return this.rootInfo()
  }

  async openFile(value: unknown): Promise<string> {
    return this.readFile(value)
  }

  async readFile(value: unknown): Promise<string> {
    const relativePath = stringArg(value, 'path')
    const absolutePath = this.resolve(relativePath)
    const cached = this.buffers.get(relativePath)
    if (cached) return cached.content
    return fs.promises.readFile(absolutePath, 'utf8')
  }

  async workspaceIndex(): Promise<FsWorkspaceIndex> {
    return this.runSearchIndexTask(() => this.buildWorkspaceIndex())
  }

  async workspaceGraph(): Promise<FsGraph> {
    return buildWorkspaceGraph(await this.workspaceIndex())
  }

  async outlineGraph(value: unknown): Promise<FsGraph> {
    const relativePath = stringArg(value, 'path')
    return buildOutlineGraph(relativePath, await this.readFile({ path: relativePath }))
  }

  async analyzeMarkdownBuffer(value: unknown): Promise<FsMarkdownDiagnostic[]> {
    const pathValue = stringArg(value, 'path')
    const content = stringArg(value, 'content')
    const documents = await this.workspaceDocuments(pathValue, content)
    const knownPaths = await this.workspaceKnownPaths()
    const index = {
      files: documents.map((document) => parseMarkdownDocument(document.path, document.content)),
      paths: knownPaths.paths,
      asset_paths: knownPaths.assetPaths,
    }
    return diagnosticsForFile(index, pathValue)
  }

  async searchWorkspace(value: unknown): Promise<ReturnType<typeof searchDocuments>> {
    const query = stringArg(value, 'query')
    const limitValue = value && typeof value === 'object' && 'limit' in value ? value.limit : 20
    const limit = typeof limitValue === 'number' && Number.isFinite(limitValue) ? limitValue : 20
    return this.runSearchIndexTask(async () =>
      searchDocuments(await this.workspaceDocuments(), query, limit),
    )
  }

  async rebuildSearchIndex(): Promise<void> {
    await this.runSearchIndexTask(async () => {
      await this.buildWorkspaceIndex()
    })
  }

  updateBuffer(value: unknown): FsBufferStatus {
    const relativePath = stringArg(value, 'path')
    const content = stringArg(value, 'content')
    this.resolve(relativePath)
    const previous = this.buffers.get(relativePath)
    const record = {
      content,
      dirty: true,
      revision: (previous?.revision ?? 0) + 1,
    }
    this.buffers.set(relativePath, record)
    const status = this.statusFor(relativePath, record)
    this.emitBufferStatus(status)
    this.updateBufferFlushIdleTask()
    return status
  }

  writeFile(value: unknown): void {
    this.updateBuffer(value)
  }

  async flushBuffers(): Promise<number> {
    if (this.flushInFlight) return this.flushInFlight
    this.flushInFlight = this.flushBuffersOnce().finally(() => {
      this.flushInFlight = null
    })
    return this.flushInFlight
  }

  private async flushBuffersOnce(): Promise<number> {
    const dirty = [...this.buffers.entries()].filter(([, record]) => record.dirty)
    if (dirty.length === 0) {
      this.updateBufferFlushIdleTask()
      return 0
    }

    this.setTask('buffer-flush', 'Save queue', 'running', `${dirty.length} pending`)
    let flushed = 0
    try {
      for (const [relativePath, record] of dirty) {
        const absolutePath = this.resolve(relativePath)
        await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true })
        await this.writeBufferFile(absolutePath, record.content)

        const current = this.buffers.get(relativePath)
        if (current !== record || current.revision !== record.revision) continue

        record.dirty = false
        flushed += 1
        this.emitBufferStatus(this.statusFor(relativePath, record))
      }

      this.updateBufferFlushIdleTask()
      if (flushed > 0) this.scheduleSnapshotChanged()
      return flushed
    } catch (error) {
      this.setTask('buffer-flush', 'Save queue', 'error', errorMessage(error))
      throw error
    }
  }

  getBufferStatus(value: unknown): FsBufferStatus | null {
    const relativePath = stringArg(value, 'path')
    this.resolve(relativePath)
    const record = this.buffers.get(relativePath)
    return record ? this.statusFor(relativePath, record) : null
  }

  getBackgroundTasks(): BackgroundTaskStatus[] {
    this.updateBufferFlushIdleTask()
    this.updateWatcherTask()
    return [...this.tasks.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  async createFile(value: unknown): Promise<void> {
    this.ensureWorkspaceMode()
    const relativePath = stringArg(value, 'path')
    const absolutePath = this.resolve(relativePath)
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true })
    if (!(await pathExists(absolutePath))) {
      await fs.promises.writeFile(absolutePath, '')
      this.buffers.set(relativePath, { content: '', dirty: false, revision: 0 })
    } else {
      this.buffers.delete(relativePath)
    }
    this.scheduleSnapshotChanged({ restartWatcher: true })
  }

  async createDir(value: unknown): Promise<void> {
    this.ensureWorkspaceMode()
    const absolutePath = this.resolve(stringArg(value, 'path'))
    await fs.promises.mkdir(absolutePath, { recursive: true })
    this.scheduleSnapshotChanged({ restartWatcher: true })
  }

  async renamePath(value: unknown): Promise<void> {
    this.ensureWorkspaceMode()
    const from = stringArg(value, 'from')
    const to = stringArg(value, 'to')
    const target = this.resolve(to)
    await fs.promises.mkdir(path.dirname(target), { recursive: true })
    await fs.promises.rename(this.resolve(from), target)
    this.renameBuffer(from, to)
    this.scheduleSnapshotChanged({ restartWatcher: true })
  }

  async movePath(value: unknown): Promise<void> {
    await this.renamePath(value)
  }

  async deletePath(value: unknown): Promise<void> {
    this.ensureWorkspaceMode()
    const relativePath = stringArg(value, 'path')
    const absolutePath = this.resolve(relativePath)
    const stat = await fs.promises.stat(absolutePath)
    if (stat.isDirectory()) {
      await fs.promises.rm(absolutePath, { recursive: true, force: false })
    } else {
      await fs.promises.unlink(absolutePath)
    }
    this.deleteBuffersUnder(relativePath)
    this.scheduleSnapshotChanged({ restartWatcher: true })
  }

  async pathMetadata(value: unknown): Promise<FsPathMetadata> {
    const relativePath = stringArg(value, 'path')
    const absolutePath = this.resolve(relativePath)
    const stat = await fs.promises.stat(absolutePath)
    return {
      path: relativePath,
      absolute_path: absolutePath,
      kind: stat.isDirectory() ? 'folder' : 'file',
      size_bytes: stat.size,
      modified_ms: stat.mtimeMs,
      readonly: (stat.mode & 0o200) === 0,
    }
  }

  async openPathInSystem(value: unknown): Promise<void> {
    const metadata = await this.pathMetadata(value)
    const error = await this.shell.openPath(metadata.absolute_path)
    if (error) throw new Error(`Failed to open path: ${error}`)
  }

  async importMarkdownAsset(value: unknown): Promise<FsMarkdownAssetImportResult> {
    const sourcePath = stringArg(value, 'sourcePath')
    const documentPath = stringArg(value, 'documentPath')
    const strategy = stringArg(value, 'strategy')
    const title = nullableStringArg(value, 'title')
    const documentAbs = this.resolve(documentPath)
    const stat = await fs.promises.stat(sourcePath)
    if (!stat.isFile()) throw new Error('Source asset must be a file')

    if (strategy === 'preserve-path') {
      return this.preserveAssetPath(sourcePath, documentAbs)
    }
    if (strategy !== 'copy-to-document-assets' && strategy !== '') {
      throw new Error(`Unsupported Markdown asset strategy: ${strategy}`)
    }
    const result = await this.copyAssetToDocumentAssets(sourcePath, documentAbs, title)
    this.scheduleSnapshotChanged({ restartWatcher: true })
    return result
  }

  async importMarkdownAssetBase64(value: unknown): Promise<FsMarkdownAssetImportResult> {
    const fileName = stringArg(value, 'fileName')
    const base64Data = stringArg(value, 'base64Data')
    const documentPath = stringArg(value, 'documentPath')
    const title = nullableStringArg(value, 'title')
    const bytes = Buffer.from(base64Data, 'base64')
    if (bytes.length === 0) throw new Error('Asset content must not be empty')
    const result = await this.writeAssetBytes(fileName, bytes, this.resolve(documentPath), title)
    this.scheduleSnapshotChanged({ restartWatcher: true })
    return result
  }

  async resolveMarkdownAsset(value: unknown): Promise<FsMarkdownAssetResolveResult> {
    const documentPath = stringArg(value, 'documentPath')
    const target = stringArg(value, 'target').trim()
    if (!target) throw new Error('Asset target must not be empty')
    if (isExternalTarget(target)) {
      return {
        source_path: documentPath,
        target,
        absolute_path: null,
        relative_path: null,
        is_external: true,
        media_type: guessMediaType(target),
        exists: false,
      }
    }

    const documentAbs = this.resolve(documentPath)
    const localTarget = decodeURIComponentSafe(stripAssetQueryAndHash(target))
    const absolutePath = path.isAbsolute(localTarget)
      ? path.resolve(localTarget)
      : path.resolve(path.dirname(documentAbs), localTarget)
    return {
      source_path: documentPath,
      target,
      absolute_path: absolutePath,
      relative_path: toWorkspaceRelative(workspaceRootForAssets(this.state), absolutePath),
      is_external: false,
      media_type: guessMediaType(localTarget),
      exists: await pathExists(absolutePath),
    }
  }

  onBufferStatus(listener: BufferStatusListener): () => void {
    this.bufferListeners.add(listener)
    return () => this.bufferListeners.delete(listener)
  }

  onSnapshotChanged(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener)
    return () => this.snapshotListeners.delete(listener)
  }

  dispose(): void {
    this.disposed = true
    this.watcherVersion += 1
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer)
      this.snapshotTimer = null
    }
    if (this.autoFlushTimer) {
      clearInterval(this.autoFlushTimer)
      this.autoFlushTimer = null
    }
    this.stopWatchers()
    this.setTask('watcher', 'Workspace watcher', 'idle', 'Stopped')
    this.bufferListeners.clear()
    this.snapshotListeners.clear()
  }

  private async buildWorkspaceIndex(): Promise<FsWorkspaceIndex> {
    const documents = await this.workspaceDocuments()
    const knownPaths = await this.workspaceKnownPaths()
    return {
      files: documents.map((document) => parseMarkdownDocument(document.path, document.content)),
      paths: knownPaths.paths,
      asset_paths: knownPaths.assetPaths,
    }
  }

  private async listEntries() {
    if (this.state.rootKind === 'single') {
      if (!this.state.singleFile) return []
      const name = path.basename(this.state.singleFile)
      return [{ path: name, name, kind: 'file' as const }]
    }

    const entries = await this.walkWorkspace(this.state.rootPath)
    entries.sort((a, b) => a.path.localeCompare(b.path))
    return entries
  }

  private async workspaceDocuments(replacePath?: string, replaceContent?: string) {
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

  private async workspaceKnownPaths(): Promise<{ paths: string[]; assetPaths: string[] }> {
    if (this.state.rootKind === 'single') {
      if (!this.state.singleFile) return { paths: [], assetPaths: [] }
      return { paths: [path.basename(this.state.singleFile)], assetPaths: [] }
    }

    const paths: string[] = []
    const assetPaths: string[] = []
    const visit = async (directory: string) => {
      if (!(await pathExists(directory))) return
      for (const dirent of await fs.promises.readdir(directory, { withFileTypes: true })) {
        if (dirent.name.startsWith('.')) continue
        const absolutePath = path.join(directory, dirent.name)
        const relativePath = toWorkspaceRelative(this.state.rootPath, absolutePath)
        if (!relativePath) continue
        paths.push(relativePath)
        if (dirent.isDirectory()) {
          await visit(absolutePath)
        } else if (dirent.isFile() && !isMarkdownPath(dirent.name)) {
          assetPaths.push(relativePath)
        }
      }
    }
    await visit(this.state.rootPath)
    return {
      paths: paths.sort((a, b) => a.localeCompare(b)),
      assetPaths: assetPaths.sort((a, b) => a.localeCompare(b)),
    }
  }

  private async walkWorkspace(root: string) {
    const entries: FsEntry[] = []
    const visit = async (directory: string) => {
      if (!(await pathExists(directory))) return
      for (const dirent of await fs.promises.readdir(directory, { withFileTypes: true })) {
        if (dirent.name.startsWith('.')) continue
        const absolutePath = path.join(directory, dirent.name)
        const relativePath = toWorkspaceRelative(root, absolutePath)
        if (!relativePath) continue
        if (dirent.isDirectory()) {
          entries.push({ path: relativePath, name: dirent.name, kind: 'folder' as const })
          await visit(absolutePath)
        } else if (dirent.isFile() && isMarkdownPath(dirent.name)) {
          entries.push({ path: relativePath, name: dirent.name, kind: 'file' as const })
        }
      }
    }
    await visit(root)
    return entries
  }

  private resolve(relativePath: string): string {
    return resolveWorkspacePath(this.state, relativePath)
  }

  private ensureWorkspaceMode(): void {
    if (this.state.rootKind === 'single') {
      throw new Error('Operation is not supported in single-file mode')
    }
  }

  private ensureDefaultFile(root: string): void {
    const hasMarkdown = findMarkdownFile(root)
    if (!hasMarkdown) fs.writeFileSync(path.join(root, 'Untitled.md'), '')
  }

  private statusFor(relativePath: string, record: BufferRecord): FsBufferStatus {
    return { path: relativePath, revision: record.revision, dirty: record.dirty }
  }

  private emitBufferStatus(status: FsBufferStatus): void {
    for (const listener of this.bufferListeners) listener(status)
  }

  private initializeBackgroundTasks(): void {
    this.setTask('search-index', 'Search index', 'idle', null)
    this.setTask('buffer-flush', 'Save queue', 'idle', null)
    this.setTask('watcher', 'Workspace watcher', 'idle', null)
  }

  private setTask(
    id: string,
    label: string,
    status: BackgroundTaskStatus['status'],
    message: string | null,
  ): void {
    this.tasks.set(id, { id, label, status, message })
  }

  private async runSearchIndexTask<T>(work: () => Promise<T>): Promise<T> {
    this.searchIndexRuns += 1
    this.setTask('search-index', 'Search index', 'running', null)
    try {
      return await work()
    } catch (error) {
      this.setTask('search-index', 'Search index', 'error', errorMessage(error))
      throw error
    } finally {
      this.searchIndexRuns -= 1
      if (this.searchIndexRuns === 0 && this.tasks.get('search-index')?.status !== 'error') {
        this.setTask('search-index', 'Search index', 'idle', null)
      }
    }
  }

  private updateBufferFlushIdleTask(): void {
    const currentStatus = this.tasks.get('buffer-flush')?.status
    if (currentStatus === 'running' || currentStatus === 'error') return
    const dirtyCount = [...this.buffers.values()].filter((record) => record.dirty).length
    this.setTask(
      'buffer-flush',
      'Save queue',
      'idle',
      dirtyCount > 0 ? `${dirtyCount} pending` : null,
    )
  }

  private updateWatcherTask(message?: string): void {
    const current = this.tasks.get('watcher')
    if (current?.status === 'error' && !message) return
    if (this.disposed) {
      this.setTask('watcher', 'Workspace watcher', 'idle', 'Stopped')
      return
    }
    if (!this.watcher) {
      this.setTask('watcher', 'Workspace watcher', 'idle', message ?? 'No active watcher')
      return
    }
    this.setTask('watcher', 'Workspace watcher', 'running', message ?? 'Watcher active')
  }

  private startAutoFlushWorker(): void {
    this.autoFlushTimer = setInterval(() => {
      if (this.disposed || this.flushInFlight) return
      if (![...this.buffers.values()].some((record) => record.dirty)) return
      void this.flushBuffers().catch((error) => {
        console.warn('background buffer flush failed', error)
      })
    }, BUFFER_AUTO_FLUSH_INTERVAL_MS)
  }

  private scheduleSnapshotChanged(options?: { restartWatcher?: boolean }): void {
    if (this.disposed) return
    this.pendingSnapshotWatcherRestart =
      this.pendingSnapshotWatcherRestart || Boolean(options?.restartWatcher)
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null
      void this.emitSnapshotChanged()
    }, WATCH_DEBOUNCE_MS)
  }

  private async emitSnapshotChanged(): Promise<void> {
    if (this.disposed) return
    const shouldRestartWatcher = this.pendingSnapshotWatcherRestart
    this.pendingSnapshotWatcherRestart = false
    try {
      const snapshot = await this.snapshot()
      if (shouldRestartWatcher) this.restartWatcher()
      for (const listener of this.snapshotListeners) listener(snapshot)
    } catch (error) {
      console.warn('workspace snapshot changed event failed', error)
      if (shouldRestartWatcher) this.restartWatcher()
    }
  }

  private restartWatcher(): void {
    if (this.disposed) return
    this.watcherVersion += 1
    this.stopWatchers()
    this.currentWatchRoot = null
    this.setTask('watcher', 'Workspace watcher', 'running', 'Starting watcher')
    const version = this.watcherVersion
    void this.startWatcher(version)
      .then(() => {
        if (this.disposed || version !== this.watcherVersion) return
        this.updateWatcherTask()
      })
      .catch((error) => {
        if (this.disposed || version !== this.watcherVersion) return
        this.setTask('watcher', 'Workspace watcher', 'error', errorMessage(error))
        console.warn('workspace watcher failed to start', error)
      })
  }

  private stopWatchers(): void {
    const watcher = this.watcher
    this.watcher = null
    if (!watcher) return

    void watcher.close().catch((error) => {
      console.warn('workspace watcher close failed', error)
    })
  }

  private async startWatcher(version: number): Promise<void> {
    const rootPath = this.state.rootPath
    if (!rootPath) return

    const watchRoot =
      this.state.rootKind === 'single' && this.state.singleFile
        ? path.dirname(this.state.singleFile)
        : rootPath
    if (!fs.existsSync(watchRoot)) return

    const stat = safeStatSync(watchRoot)
    if (!stat?.isDirectory()) return
    this.currentWatchRoot = path.resolve(watchRoot)

    const watcher = watch(this.currentWatchRoot, {
      ignoreInitial: true,
      ignored: (watchedPath) => this.shouldIgnoreWatchPath(watchedPath),
    })

    watcher.on('all', (eventName, changedPath) => {
      if (!isWorkspaceWatchEvent(eventName)) return
      if (this.disposed || version !== this.watcherVersion) return
      this.handleWatchEvent(changedPath, version)
    })
    watcher.on('error', (error) => {
      if (this.watcher === watcher) this.watcher = null
      this.setTask('watcher', 'Workspace watcher', 'error', errorMessage(error))
      console.warn('workspace watcher error', error)
    })
    this.watcher = watcher
  }

  private handleWatchEvent(watchedPath: string, version: number): void {
    if (this.disposed || version !== this.watcherVersion) return

    const changedPath = this.resolveWatchedPath(watchedPath)
    if (changedPath === 'ignore') return
    if (this.isOwnWriteEvent(changedPath)) return

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
      this.invalidateAllCleanBuffers()
    }

    this.scheduleSnapshotChanged()
  }

  private resolveWatchedPath(watchedPath: string): string | 'ignore' | null {
    if (!watchedPath) return null
    if (this.shouldIgnoreWatchPath(watchedPath)) return 'ignore'

    const absolutePath = path.resolve(watchedPath)
    const watchRoot = this.currentWatchRoot
    if (watchRoot && !isPathInsideOrEqual(watchRoot, absolutePath)) return 'ignore'
    return absolutePath
  }

  private shouldIgnoreWatchPath(watchedPath: string): boolean {
    const watchRoot = this.currentWatchRoot
    const relativePath = watchRoot
      ? normalizeRelativePath(path.relative(watchRoot, path.resolve(watchedPath)))
      : normalizeRelativePath(watchedPath)
    if (!relativePath || relativePath === '.') return false
    return isTempWritePath(relativePath) || hasHiddenPathSegment(relativePath)
  }

  private invalidateCurrentSingleFileBuffer(): void {
    const singleFile = this.state.singleFile
    if (!singleFile) return
    this.invalidateCleanBuffersForRelativePaths([path.basename(singleFile)])
  }

  private invalidateCleanBuffersForAbsolutePaths(absolutePaths: string[]): void {
    const relativePaths: string[] = []
    for (const absolutePath of absolutePaths) {
      const relativePath = toWorkspaceRelative(workspaceRootForAssets(this.state), absolutePath)
      if (!relativePath) continue
      relativePaths.push(relativePath)
    }
    this.invalidateCleanBuffersForRelativePaths(relativePaths)
  }

  private invalidateCleanBuffersForRelativePaths(relativePaths: string[]): void {
    for (const relativePath of relativePaths) {
      for (const [bufferPath, record] of this.buffers.entries()) {
        if (record.dirty) continue
        if (bufferPath === relativePath || bufferPath.startsWith(`${relativePath}/`)) {
          this.buffers.delete(bufferPath)
        }
      }
    }
  }

  private invalidateAllCleanBuffers(): void {
    for (const [bufferPath, record] of this.buffers.entries()) {
      if (!record.dirty) this.buffers.delete(bufferPath)
    }
  }

  private async writeBufferFile(absolutePath: string, content: string): Promise<void> {
    const existing = await fs.promises.readFile(absolutePath, 'utf8').catch(() => null)
    if (existing === content) return

    const tempPath = this.tempWritePath(absolutePath)
    this.markOwnWrite(absolutePath)
    this.markOwnWrite(tempPath)
    try {
      await fs.promises.writeFile(tempPath, content)
      await fs.promises.rename(tempPath, absolutePath)
    } catch (error) {
      await fs.promises.unlink(tempPath).catch(() => undefined)
      throw error
    }
  }

  private tempWritePath(absolutePath: string): string {
    return `${absolutePath}.${process.pid}.${Date.now()}.tmp`
  }

  private markOwnWrite(absolutePath: string): void {
    const expiresAt = Date.now() + OWN_WRITE_EVENT_SUPPRESS_MS
    this.ownWriteSuppressUntil = Math.max(this.ownWriteSuppressUntil, expiresAt)
    this.recentOwnWrites.set(normalizeAbsolutePath(absolutePath), expiresAt)
  }

  private isOwnWriteEvent(absolutePath: string | null): boolean {
    const now = Date.now()
    for (const [key, expiresAt] of this.recentOwnWrites.entries()) {
      if (expiresAt <= now) this.recentOwnWrites.delete(key)
    }

    if (!absolutePath) return now < this.ownWriteSuppressUntil
    const expiresAt = this.recentOwnWrites.get(normalizeAbsolutePath(absolutePath))
    if (expiresAt == null || expiresAt <= now) return false
    return true
  }

  private isCurrentSingleFile(absolutePath: string): boolean {
    return Boolean(this.state.singleFile && samePath(this.state.singleFile, absolutePath))
  }

  private renameBuffer(from: string, to: string): void {
    for (const [bufferPath, record] of [...this.buffers.entries()]) {
      if (bufferPath !== from && !bufferPath.startsWith(`${from}/`)) continue
      const suffix = bufferPath.slice(from.length)
      this.buffers.delete(bufferPath)
      this.buffers.set(`${to}${suffix}`, record)
    }
  }

  private deleteBuffersUnder(relativePath: string): void {
    for (const bufferPath of [...this.buffers.keys()]) {
      if (bufferPath === relativePath || bufferPath.startsWith(`${relativePath}/`)) {
        this.buffers.delete(bufferPath)
      }
    }
  }

  private preserveAssetPath(sourcePath: string, documentAbs: string): FsMarkdownAssetImportResult {
    const markdownTarget = normalizeMarkdownTarget(
      path.relative(path.dirname(documentAbs), sourcePath),
    )
    return {
      markdown_target: markdownTarget,
      relative_path: normalizeRelativePath(sourcePath),
      absolute_path: path.resolve(sourcePath),
      asset_dir: null,
      copied: false,
    }
  }

  private async copyAssetToDocumentAssets(
    sourcePath: string,
    documentAbs: string,
    title: string | null,
  ): Promise<FsMarkdownAssetImportResult> {
    const assetDir = this.assetDirName(documentAbs, title)
    const assetDirAbs = path.join(path.dirname(documentAbs), assetDir)
    this.ensureInsideAssetRoot(assetDirAbs)
    await fs.promises.mkdir(assetDirAbs, { recursive: true })
    const targetAbs = await this.uniqueAssetTarget(assetDirAbs, path.basename(sourcePath))
    await fs.promises.copyFile(sourcePath, targetAbs)
    return this.copiedAssetResult(documentAbs, targetAbs, assetDir)
  }

  private async writeAssetBytes(
    fileName: string,
    bytes: Buffer,
    documentAbs: string,
    title: string | null,
  ): Promise<FsMarkdownAssetImportResult> {
    const assetDir = this.assetDirName(documentAbs, title)
    const assetDirAbs = path.join(path.dirname(documentAbs), assetDir)
    this.ensureInsideAssetRoot(assetDirAbs)
    await fs.promises.mkdir(assetDirAbs, { recursive: true })
    const targetAbs = await this.uniqueAssetTarget(assetDirAbs, fileName)
    await fs.promises.writeFile(targetAbs, bytes)
    return this.copiedAssetResult(documentAbs, targetAbs, assetDir)
  }

  private copiedAssetResult(
    documentAbs: string,
    targetAbs: string,
    assetDir: string,
  ): FsMarkdownAssetImportResult {
    return {
      markdown_target: normalizeMarkdownTarget(path.relative(path.dirname(documentAbs), targetAbs)),
      relative_path:
        toWorkspaceRelative(workspaceRootForAssets(this.state), targetAbs) ??
        normalizeRelativePath(targetAbs),
      absolute_path: targetAbs,
      asset_dir: assetDir,
      copied: true,
    }
  }

  private assetDirName(documentAbs: string, title: string | null): string {
    const stem = path.parse(documentAbs).name || 'document'
    return `${sanitizeFileStem(title || stem) || 'document'}.assets`
  }

  private ensureInsideAssetRoot(assetPath: string): void {
    const root = path.resolve(workspaceRootForAssets(this.state))
    const relative = normalizeRelativePath(path.relative(root, path.resolve(assetPath)))
    if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
      throw new Error('Asset target must stay inside the current workspace')
    }
  }

  private async uniqueAssetTarget(assetDirAbs: string, originalName: string): Promise<string> {
    const parsed = path.parse(originalName)
    const stem = sanitizeFileStem(parsed.name) || 'asset'
    const ext = parsed.ext.replace(/[^.\da-z]/gi, '')
    for (let index = 0; ; index += 1) {
      const suffix = index === 0 ? '' : `-${index}`
      const candidate = path.join(assetDirAbs, `${stem}${suffix}${ext}`)
      if (!(await pathExists(candidate))) return candidate
    }
  }
}

function stringArg(value: unknown, key: string): string {
  const result =
    value && typeof value === 'object' && key in value
      ? (value as Record<string, unknown>)[key]
      : value
  if (typeof result !== 'string') throw new Error(`${key} must be a string`)
  return result
}

function nullableStringArg(value: unknown, key: string): string | null {
  const result =
    value && typeof value === 'object' && key in value
      ? (value as Record<string, unknown>)[key]
      : null
  if (result == null) return null
  if (typeof result !== 'string') throw new Error(`${key} must be a string`)
  return result
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await fs.promises.access(value)
    return true
  } catch {
    return false
  }
}

function safeStatSync(value: string): ReturnType<typeof fs.statSync> | null {
  try {
    return fs.statSync(value)
  } catch {
    return null
  }
}

function isTempWritePath(value: string): boolean {
  return path.extname(value).toLowerCase() === '.tmp'
}

function hasHiddenPathSegment(value: string): boolean {
  return normalizeRelativePath(value)
    .split('/')
    .some((segment) => segment.startsWith('.'))
}

function isPathInsideOrEqual(root: string, absolutePath: string): boolean {
  const relative = normalizeRelativePath(
    path.relative(path.resolve(root), path.resolve(absolutePath)),
  )
  return (
    relative === '' ||
    relative === '.' ||
    (!relative.startsWith('../') && relative !== '..' && !path.isAbsolute(relative))
  )
}

function normalizeAbsolutePath(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function samePath(left: string, right: string): boolean {
  return normalizeAbsolutePath(left) === normalizeAbsolutePath(right)
}

function isWorkspaceWatchEvent(value: string): value is WatchEventName {
  return (
    value === 'add' ||
    value === 'change' ||
    value === 'unlink' ||
    value === 'addDir' ||
    value === 'unlinkDir'
  )
}

function findMarkdownFile(root: string): boolean {
  if (!fs.existsSync(root)) return false
  for (const name of fs.readdirSync(root, { withFileTypes: true })) {
    if (name.name.startsWith('.')) continue
    const absolutePath = path.join(root, name.name)
    if (name.isDirectory() && findMarkdownFile(absolutePath)) return true
    if (name.isFile() && isMarkdownPath(name.name)) return true
  }
  return false
}

function sanitizeFileStem(value: string): string {
  return value
    .replace(/[\\/:"*?<>|\p{C}]/gu, '-')
    .split(/\s+/)
    .join(' ')
    .replace(/^[. ]+|[. ]+$/g, '')
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
