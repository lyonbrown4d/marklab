import fs from 'node:fs'
import path from 'node:path'

import { noopLogger, type Logger } from '@electron/services/logger.js'
import type { BackgroundTaskStatus, FsBufferStatus } from '@electron/services/workspace/types.js'

type BufferRecord = {
  content: string
  dirty: boolean
  revision: number
}

type BufferStatusListener = (status: FsBufferStatus) => void

type WorkspaceBufferStoreOptions = {
  logger?: Logger
  resolvePath: (relativePath: string) => string
  markOwnWrite: (absolutePath: string) => void
  scheduleSnapshotChanged: () => void
  onBuffersFlushed?: (relativePaths: string[]) => void
  setTask: (
    id: string,
    label: string,
    status: BackgroundTaskStatus['status'],
    message: string | null,
  ) => void
  errorMessage: (error: unknown) => string
}

const BUFFER_AUTO_FLUSH_INTERVAL_MS = 3000

export class WorkspaceBufferStore {
  private readonly buffers = new Map<string, BufferRecord>()
  private readonly listeners = new Set<BufferStatusListener>()
  private autoFlushTimer: ReturnType<typeof setInterval> | null = null
  private flushInFlight: Promise<number> | null = null
  private disposed = false
  private readonly logger: Logger

  constructor(private readonly options: WorkspaceBufferStoreOptions) {
    this.logger = options.logger ?? noopLogger
    this.startAutoFlushWorker()
  }

  clear(): void {
    this.buffers.clear()
    this.updateFlushIdleTask()
  }

  readCached(relativePath: string): string | null {
    return this.buffers.get(relativePath)?.content ?? null
  }

  setCleanFile(relativePath: string, content: string): void {
    this.buffers.set(relativePath, { content, dirty: false, revision: 0 })
    this.emitStatusFor(relativePath)
  }

  delete(relativePath: string): void {
    this.buffers.delete(relativePath)
    this.updateFlushIdleTask()
  }

  update(relativePath: string, content: string): FsBufferStatus {
    const previous = this.buffers.get(relativePath)
    const record = {
      content,
      dirty: true,
      revision: (previous?.revision ?? 0) + 1,
    }
    this.buffers.set(relativePath, record)
    const status = this.statusFor(relativePath, record)
    this.emitBufferStatus(status)
    this.updateFlushIdleTask()
    return status
  }

  async flush(): Promise<number> {
    if (this.flushInFlight) return this.flushInFlight
    this.flushInFlight = this.flushOnce().finally(() => {
      this.flushInFlight = null
    })
    return this.flushInFlight
  }

  getStatus(relativePath: string): FsBufferStatus | null {
    const record = this.buffers.get(relativePath)
    return record ? this.statusFor(relativePath, record) : null
  }

  getBackgroundDirtyCount(): number {
    return [...this.buffers.values()].filter((record) => record.dirty).length
  }

  updateFlushIdleTask(): void {
    const currentStatus = this.currentFlushTaskStatus()
    if (currentStatus === 'running' || currentStatus === 'error') return
    const dirtyCount = this.getBackgroundDirtyCount()
    this.options.setTask(
      'buffer-flush',
      'Save queue',
      'idle',
      dirtyCount > 0 ? `${dirtyCount} pending` : null,
    )
  }

  rename(from: string, to: string): void {
    for (const [bufferPath, record] of [...this.buffers.entries()]) {
      if (bufferPath !== from && !bufferPath.startsWith(`${from}/`)) continue
      const suffix = bufferPath.slice(from.length)
      this.buffers.delete(bufferPath)
      this.buffers.set(`${to}${suffix}`, record)
    }
    this.updateFlushIdleTask()
  }

  deleteUnder(relativePath: string): void {
    for (const bufferPath of [...this.buffers.keys()]) {
      if (bufferPath === relativePath || bufferPath.startsWith(`${relativePath}/`)) {
        this.buffers.delete(bufferPath)
      }
    }
    this.updateFlushIdleTask()
  }

  invalidateCleanForRelativePaths(relativePaths: string[]): void {
    for (const relativePath of relativePaths) {
      for (const [bufferPath, record] of this.buffers.entries()) {
        if (record.dirty) continue
        if (bufferPath === relativePath || bufferPath.startsWith(`${relativePath}/`)) {
          this.buffers.delete(bufferPath)
        }
      }
    }
  }

  invalidateAllClean(): void {
    for (const [bufferPath, record] of this.buffers.entries()) {
      if (!record.dirty) this.buffers.delete(bufferPath)
    }
  }

  onStatus(listener: BufferStatusListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.autoFlushTimer) {
      clearInterval(this.autoFlushTimer)
      this.autoFlushTimer = null
    }
    this.listeners.clear()
  }

  private async flushOnce(): Promise<number> {
    const dirty = [...this.buffers.entries()].filter(([, record]) => record.dirty)
    if (dirty.length === 0) {
      this.updateFlushIdleTask()
      return 0
    }

    this.options.setTask('buffer-flush', 'Save queue', 'running', `${dirty.length} pending`)
    this.logger.info('buffer flush started', { dirtyCount: dirty.length })
    let flushed = 0
    const flushedPaths: string[] = []
    try {
      for (const [relativePath, record] of dirty) {
        const absolutePath = this.options.resolvePath(relativePath)
        await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true })
        await this.writeBufferFile(absolutePath, record.content)

        const current = this.buffers.get(relativePath)
        if (current !== record || current.revision !== record.revision) continue

        record.dirty = false
        flushed += 1
        flushedPaths.push(relativePath)
        this.emitBufferStatus(this.statusFor(relativePath, record))
      }

      this.updateFlushIdleTask()
      if (flushed > 0) {
        this.options.scheduleSnapshotChanged()
        this.options.onBuffersFlushed?.(flushedPaths)
      }
      this.logger.info('buffer flush finished', { flushed })
      return flushed
    } catch (error) {
      this.options.setTask('buffer-flush', 'Save queue', 'error', this.options.errorMessage(error))
      this.logger.error('buffer flush failed', { error })
      throw error
    }
  }

  private async writeBufferFile(absolutePath: string, content: string): Promise<void> {
    const existing = await fs.promises.readFile(absolutePath, 'utf8').catch(() => null)
    if (existing === content) return

    const tempPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`
    this.options.markOwnWrite(absolutePath)
    this.options.markOwnWrite(tempPath)
    try {
      await fs.promises.writeFile(tempPath, content)
      await fs.promises.rename(tempPath, absolutePath)
    } catch (error) {
      await fs.promises.unlink(tempPath).catch(() => undefined)
      throw error
    }
  }

  private startAutoFlushWorker(): void {
    this.autoFlushTimer = setInterval(() => {
      if (this.disposed || this.flushInFlight) return
      if (this.getBackgroundDirtyCount() === 0) return
      void this.flush().catch((error) => {
        this.logger.warn('background buffer flush failed', { error })
      })
    }, BUFFER_AUTO_FLUSH_INTERVAL_MS)
  }

  private statusFor(relativePath: string, record: BufferRecord): FsBufferStatus {
    return { path: relativePath, revision: record.revision, dirty: record.dirty }
  }

  private emitStatusFor(relativePath: string): void {
    const record = this.buffers.get(relativePath)
    if (record) this.emitBufferStatus(this.statusFor(relativePath, record))
  }

  private emitBufferStatus(status: FsBufferStatus): void {
    for (const listener of this.listeners) listener(status)
  }

  getDirtyRecords(): Array<{ path: string; content: string }> {
    const dirty: Array<{ path: string; content: string }> = []
    for (const [relativePath, record] of this.buffers) {
      if (!record.dirty) continue
      dirty.push({ path: relativePath, content: record.content })
    }
    return dirty
  }

  private currentFlushTaskStatus(): BackgroundTaskStatus['status'] | null {
    return null
  }
}
