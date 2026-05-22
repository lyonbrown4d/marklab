import fs from 'node:fs'
import path from 'node:path'
import { watch, type FSWatcher } from 'chokidar'

import { noopLogger, type Logger } from '@electron/services/logger.js'
import { normalizeRelativePath } from '@electron/services/workspace/path.js'
import type { BackgroundTaskStatus, FsStateData } from '@electron/services/workspace/types.js'
import {
  errorMessage,
  hasHiddenPathSegment,
  isPathInsideOrEqual,
  isTempWritePath,
  isWorkspaceWatchEvent,
  normalizeAbsolutePath,
  safeStatSync,
} from '@electron/services/workspace/workspaceUtils.js'

type WorkspaceWatcherOptions = {
  getState: () => FsStateData
  logger?: Logger
  onChanged: (absolutePath: string | null) => void
  setStatus: (status: BackgroundTaskStatus['status'], message: string | null) => void
}

const OWN_WRITE_EVENT_SUPPRESS_MS = 1500

export class WorkspaceWatcher {
  private readonly logger: Logger
  private watcher: FSWatcher | null = null
  private readonly recentOwnWrites = new Map<string, number>()
  private currentWatchRoot: string | null = null
  private ownWriteSuppressUntil = 0
  private watcherVersion = 0
  private disposed = false

  constructor(private readonly options: WorkspaceWatcherOptions) {
    this.logger = options.logger ?? noopLogger
  }

  restart(): void {
    if (this.disposed) return
    this.logger.info('watcher restarting')
    this.watcherVersion += 1
    this.stop()
    this.currentWatchRoot = null
    this.options.setStatus('running', 'Starting watcher')
    const version = this.watcherVersion
    void this.start(version)
      .then(() => {
        if (this.disposed || version !== this.watcherVersion) return
        this.updateStatus()
      })
      .catch((error) => {
        if (this.disposed || version !== this.watcherVersion) return
        this.options.setStatus('error', errorMessage(error))
        this.logger.error('watcher failed to start', { error })
      })
  }

  markOwnWrite(absolutePath: string): void {
    const expiresAt = Date.now() + OWN_WRITE_EVENT_SUPPRESS_MS
    this.ownWriteSuppressUntil = Math.max(this.ownWriteSuppressUntil, expiresAt)
    this.recentOwnWrites.set(normalizeAbsolutePath(absolutePath), expiresAt)
  }

  dispose(): void {
    this.disposed = true
    this.watcherVersion += 1
    this.logger.info('watcher disposing')
    this.stop()
    this.options.setStatus('idle', 'Stopped')
  }

  private stop(): void {
    const watcher = this.watcher
    this.watcher = null
    if (!watcher) return

    void watcher.close().catch((error) => {
      this.logger.warn('watcher close failed', { error })
    })
  }

  private async start(version: number): Promise<void> {
    const state = this.options.getState()
    const rootPath = state.rootPath
    if (!rootPath) return

    const watchRoot =
      state.rootKind === 'single' && state.singleFile ? path.dirname(state.singleFile) : rootPath
    if (!fs.existsSync(watchRoot)) return

    const stat = safeStatSync(watchRoot)
    if (!stat?.isDirectory()) return
    this.currentWatchRoot = path.resolve(watchRoot)
    this.logger.info('watcher starting', { watchRoot: this.currentWatchRoot })

    const watcher = watch(this.currentWatchRoot, {
      ignoreInitial: true,
      ignored: (watchedPath) => this.shouldIgnoreWatchPath(String(watchedPath)),
    })

    watcher.on('all', (eventName, changedPath) => {
      if (!isWorkspaceWatchEvent(eventName)) return
      if (this.disposed || version !== this.watcherVersion) return
      this.handleWatchEvent(changedPath, version)
    })
    watcher.on('error', (error) => {
      if (this.watcher === watcher) this.watcher = null
      this.options.setStatus('error', errorMessage(error))
      this.logger.error('watcher error', { error })
    })
    this.watcher = watcher
  }

  private updateStatus(message?: string): void {
    if (this.disposed) {
      this.options.setStatus('idle', 'Stopped')
      return
    }
    if (!this.watcher) {
      this.options.setStatus('idle', message ?? 'No active watcher')
      return
    }
    this.options.setStatus('running', message ?? 'Watcher active')
  }

  private handleWatchEvent(watchedPath: string, version: number): void {
    if (this.disposed || version !== this.watcherVersion) return

    const changedPath = this.resolveWatchedPath(watchedPath)
    if (changedPath === 'ignore') return
    if (this.isOwnWriteEvent(changedPath)) return
    this.options.onChanged(changedPath)
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
}
