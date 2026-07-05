import fs from 'node:fs'
import path from 'node:path'
import watcher, { type AsyncSubscription, type Event as ParcelWatchEvent } from '@parcel/watcher'

import { noopLogger, type Logger } from '@electron/services/logger.js'
import { normalizeRelativePath } from '@electron/services/workspace/path.js'
import type { BackgroundTaskStatus, FsStateData } from '@electron/services/workspace/types.js'
import {
  errorMessage,
  hasHiddenPathSegment,
  isPathInsideOrEqual,
  isTempWritePath,
  type WatchEventName,
  normalizeAbsolutePath,
  safeStatSync,
} from '@electron/services/workspace/workspaceUtils.js'

type WorkspaceWatcherOptions = {
  getState: () => FsStateData
  logger?: Logger
  onChanged: (absolutePath: string | null, eventName?: WatchEventName) => void
  setStatus: (status: BackgroundTaskStatus['status'], message: string | null) => void
}

const OWN_WRITE_EVENT_SUPPRESS_MS = 1500

export class WorkspaceWatcher {
  private readonly logger: Logger
  private subscription: AsyncSubscription | null = null
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
    const subscription = this.subscription
    this.subscription = null
    if (!subscription) return

    void subscription.unsubscribe().catch((error) => {
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

    let subscription: AsyncSubscription | null = null
    subscription = await watcher.subscribe(this.currentWatchRoot, (error, events) => {
      if (this.disposed || version !== this.watcherVersion) return

      if (error) {
        if (this.subscription === subscription) this.subscription = null
        this.options.setStatus('error', errorMessage(error))
        this.logger.error('watcher error', { error })
        return
      }

      events.forEach((event) => this.handleWatchEvent(event, version))
    })

    if (this.disposed || version !== this.watcherVersion) {
      void subscription.unsubscribe()
      return
    }

    this.subscription = subscription
  }

  private updateStatus(message?: string): void {
    if (this.disposed) {
      this.options.setStatus('idle', 'Stopped')
      return
    }
    if (!this.subscription) {
      this.options.setStatus('idle', message ?? 'No active watcher')
      return
    }
    this.options.setStatus('running', message ?? 'Watcher active')
  }

  private handleWatchEvent(event: ParcelWatchEvent, version: number): void {
    if (this.disposed || version !== this.watcherVersion) return

    const changedPath = this.resolveWatchedPath(event.path)
    if (changedPath === 'ignore') return
    if (this.isOwnWriteEvent(changedPath)) return
    this.options.onChanged(changedPath, this.toWorkspaceWatchEvent(event))
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

  private toWorkspaceWatchEvent(event: ParcelWatchEvent): WatchEventName {
    if (event.type === 'update') return 'change'
    if (event.type === 'delete') return 'unlink'

    const stat = safeStatSync(event.path)
    return stat?.isDirectory() ? 'addDir' : 'add'
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
