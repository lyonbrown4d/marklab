import fs from 'node:fs'
import path from 'node:path'
import watcher, { type AsyncSubscription, type Event as ParcelWatchEvent } from '@parcel/watcher'

import { noopLogger, type Logger } from '@electron/services/logger'
import { normalizeRelativePath } from '@electron/services/workspace/path'
import type { BackgroundTaskStatus, FsStateData } from '@electron/services/workspace/types'
import {
  errorMessage,
  hasHiddenPathSegment,
  isPathInsideOrEqual,
  isTempWritePath,
  type WatchEventName,
  normalizeAbsolutePath,
} from '@electron/services/workspace/workspaceUtils'

type WorkspaceWatcherOptions = {
  getState: () => FsStateData
  logger?: Logger
  onChanged: (absolutePath: string | null, eventName?: WatchEventName) => void
  setStatus: (status: BackgroundTaskStatus['status'], message: string | null) => void
}

const OWN_WRITE_EVENT_SUPPRESS_MS = 1500
const WATCH_EVENT_CHUNK_SIZE = 16
type ParcelWatcherOptions = NonNullable<Parameters<typeof watcher.subscribe>[2]>
type ParcelWatcherBackend = NonNullable<ParcelWatcherOptions['backend']>

const nativeWatcherBackends: Partial<Record<NodeJS.Platform, ParcelWatcherBackend>> = {
  darwin: 'fs-events',
  linux: 'inotify',
  win32: 'windows',
}

const nativeWatcherOptions: ParcelWatcherOptions = {
  backend: nativeWatcherBackends[process.platform],
}

export class WorkspaceWatcher {
  private readonly logger: Logger
  private subscription: AsyncSubscription | null = null
  private readonly recentOwnWrites = new Map<string, number>()
  private currentWatchRoot: string | null = null
  private ownWriteSuppressUntil = 0
  private watcherVersion = 0
  private disposed = false
  private pendingEvents: Promise<void> = Promise.resolve()

  constructor(private readonly options: WorkspaceWatcherOptions) {
    this.logger = options.logger ?? noopLogger
  }

  restart(): void {
    if (this.disposed) return
    this.logger.info('watcher restarting')
    this.watcherVersion += 1
    this.pendingEvents = Promise.resolve()
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
    const stat = await fs.promises.stat(watchRoot).catch(() => null)
    if (this.disposed || version !== this.watcherVersion) return
    if (!stat?.isDirectory()) return
    this.currentWatchRoot = path.resolve(watchRoot)
    this.logger.info('watcher starting', { watchRoot: this.currentWatchRoot })

    let subscription: AsyncSubscription | null = null
    subscription = await watcher.subscribe(
      this.currentWatchRoot,
      (error, events) => {
        if (this.disposed || version !== this.watcherVersion) return

        if (error) {
          if (this.subscription === subscription) this.subscription = null
          this.options.setStatus('error', errorMessage(error))
          this.logger.error('watcher error', { error })
          return
        }

        this.enqueueWatchEvents(events, version)
      },
      nativeWatcherOptions,
    )

    if (this.disposed || version !== this.watcherVersion) {
      void subscription.unsubscribe().catch((error) => {
        this.logger.warn('stale watcher close failed', { error })
      })
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

  private enqueueWatchEvents(events: ParcelWatchEvent[], version: number): void {
    const accepted = events.flatMap((event) => {
      const changedPath = this.resolveWatchedPath(event.path)
      return changedPath === 'ignore' || this.isOwnWriteEvent(changedPath)
        ? []
        : [{ changedPath, event }]
    })
    if (accepted.length === 0) return
    // Serialize callbacks so a later delete/update cannot overtake create metadata.
    this.pendingEvents = this.pendingEvents
      .then(async () => {
        for (let offset = 0; offset < accepted.length; offset += WATCH_EVENT_CHUNK_SIZE) {
          if (this.disposed || version !== this.watcherVersion) return
          const chunk = accepted.slice(offset, offset + WATCH_EVENT_CHUNK_SIZE)
          // Parcel supplies no directory flag. Node has no bulk stat API, so only
          // creates need metadata, with a small fixed limit on concurrent I/O.
          const names = await Promise.all(
            chunk.map(({ event }) => this.toWorkspaceWatchEvent(event)),
          )
          for (const [index, item] of chunk.entries()) {
            if (this.disposed || version !== this.watcherVersion) return
            this.options.onChanged(item.changedPath, names[index])
          }
        }
      })
      .catch((error) => {
        if (this.disposed || version !== this.watcherVersion) return
        this.options.setStatus('error', errorMessage(error))
        this.logger.error('watcher event processing failed', { error })
      })
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

  private async toWorkspaceWatchEvent(event: ParcelWatchEvent): Promise<WatchEventName> {
    if (event.type === 'update') return 'change'
    if (event.type === 'delete') return 'unlink'

    const stat = await fs.promises.stat(event.path).catch(() => null)
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
