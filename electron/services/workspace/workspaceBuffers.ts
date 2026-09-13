import type { BackgroundTaskStatus, FsBufferStatus } from '@electron/services/workspace/types.js'
import {
  assertWorkspaceClaimMutationAllowed,
  canonicalWorkspaceRelativeKey,
  createWorkspaceWriteOwner,
  releaseWorkspaceWriteOwner,
  replaceWorkspaceWriteClaims,
  type WorkspaceWriteClaim,
} from '@electron/services/workspace/workspaceWriteCoordinator.js'
import { flushWorkspaceBufferPass } from '@electron/services/workspace/workspaceBufferFlush.js'
import type {
  BufferRecord,
  WorkspaceBufferStoreOptions,
  WorkspaceBufferTarget,
} from '@electron/services/workspace/workspaceBufferTypes.js'
export type {
  WorkspaceBufferTarget,
  WorkspaceBufferWriteFile,
} from '@electron/services/workspace/workspaceBufferTypes.js'

const AUTO_FLUSH_DELAY_MS = 700
const AUTO_FLUSH_RETRY_MS = 1_500
const FLUSH_TASK_ID = 'buffer-flush'
const FLUSH_TASK_LABEL = 'Workspace save'

type BufferUpdateTarget = WorkspaceBufferTarget | { target: WorkspaceBufferTarget }
type FlushTaskState = { message: string | null; status: BackgroundTaskStatus['status'] }
type AutoFlushMutationRunner = (work: () => Promise<void>) => Promise<void>

export class WorkspaceBufferStore {
  private readonly listeners = new Set<(status: FsBufferStatus) => void>()
  private readonly ownerId = createWorkspaceWriteOwner()
  private readonly records = new Map<string, BufferRecord>()
  private autoFlushTimer: ReturnType<typeof setTimeout> | null = null
  private autoFlushMutationRunner: AutoFlushMutationRunner = (work) => work()
  private disposed = false
  private flushTail: Promise<void> = Promise.resolve()
  private mutationEpoch = 0
  private taskState: FlushTaskState = { message: null, status: 'idle' }

  constructor(private readonly options: WorkspaceBufferStoreOptions) {}

  onStatus(listener: (status: FsBufferStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setAutoFlushMutationRunner(runner: AutoFlushMutationRunner): void {
    this.autoFlushMutationRunner = runner
  }

  readCached(relativePath: string): string | null {
    return this.records.get(canonicalWorkspaceRelativeKey(relativePath))?.content ?? null
  }

  cacheCleanFile(relativePath: string, content: string): string {
    const key = canonicalWorkspaceRelativeKey(relativePath)
    const current = this.records.get(key)
    if (current?.dirty) {
      if (current.baselineContent === undefined) {
        this.assertMutable()
        current.baselineContent = content
        this.syncWriteClaims()
      }
      return current.content
    }
    this.records.set(key, this.cleanRecord(relativePath, content, current?.revision ?? 0))
    return content
  }

  setCleanFile(relativePath: string, content: string): void {
    const key = canonicalWorkspaceRelativeKey(relativePath)
    this.assertMutable()
    if (this.records.get(key)?.dirty) throw new Error('Cannot replace a dirty workspace buffer')
    const revision = (this.records.get(key)?.revision ?? 0) + 1
    this.records.set(key, this.cleanRecord(relativePath, content, revision))
    this.bumpMutation()
    this.syncWriteClaims()
    this.emit(this.records.get(key)!)
  }

  update(relativePath: string, content: string, value?: BufferUpdateTarget): FsBufferStatus {
    const key = canonicalWorkspaceRelativeKey(relativePath)
    this.assertMutable(key)
    const current = this.records.get(key)
    const baseline = current?.dirty ? current.baselineContent : current?.content
    const targetValue = value && 'target' in value ? value.target : value
    const target: WorkspaceBufferTarget = {
      absolutePath: targetValue?.absolutePath ?? this.options.resolvePath(relativePath),
      state: targetValue?.state ? { ...targetValue.state } : null,
    }
    const record: BufferRecord = {
      baselineContent: baseline,
      content,
      dirty: baseline === undefined || content !== baseline,
      relativePath,
      revision: (current?.revision ?? 0) + 1,
      target,
    }
    this.records.set(key, record)
    this.bumpMutation()
    this.syncWriteClaims()
    this.emit(record)
    this.scheduleAutoFlush()
    return this.status(record)
  }

  delete(relativePath: string): void {
    this.assertMutable()
    const key = canonicalWorkspaceRelativeKey(relativePath)
    const current = this.records.get(key)
    if (!current) return
    this.records.delete(key)
    this.bumpMutation()
    this.syncWriteClaims()
    this.emit({ ...current, dirty: false })
  }

  rename(from: string, to: string): void {
    this.assertMutable()
    const fromKey = canonicalWorkspaceRelativeKey(from)
    const toKey = canonicalWorkspaceRelativeKey(to)
    const current = this.records.get(fromKey)
    if (!current) return
    const destination = this.records.get(toKey)
    if (destination?.dirty && destination !== current) {
      throw new Error('Cannot replace dirty buffer while renaming to ' + to)
    }
    this.records.delete(fromKey)
    current.relativePath = to
    current.target = { ...current.target, absolutePath: this.options.resolvePath(to) }
    this.records.set(toKey, current)
    this.bumpMutation()
    this.syncWriteClaims()
    this.emit(current)
  }

  deleteUnder(relativePath: string): void {
    this.assertMutable()
    const prefix = canonicalWorkspaceRelativeKey(relativePath) + '/'
    let changed = false
    for (const [key, record] of this.records) {
      if (key !== prefix.slice(0, -1) && !key.startsWith(prefix)) continue
      this.records.delete(key)
      this.emit({ ...record, dirty: false })
      changed = true
    }
    if (!changed) return
    this.bumpMutation()
    this.syncWriteClaims()
  }

  getStatus(relativePath: string): FsBufferStatus | null {
    const record = this.records.get(canonicalWorkspaceRelativeKey(relativePath))
    return record ? this.status(record) : null
  }

  getBackgroundDirtyCount(): number {
    let count = 0
    for (const record of this.records.values()) if (record.dirty) count += 1
    return count
  }

  getWriteOwnerId(): string {
    return this.ownerId
  }
  getMutationEpoch(): number {
    return this.mutationEpoch
  }

  invalidateCleanForRelativePaths(relativePaths: string[]): void {
    for (const relativePath of relativePaths) {
      const key = canonicalWorkspaceRelativeKey(relativePath)
      if (this.records.get(key)?.dirty === false) this.records.delete(key)
    }
  }

  invalidateAllClean(): void {
    for (const [key, record] of this.records) if (!record.dirty) this.records.delete(key)
  }

  flush(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Workspace buffers are disposed'))
    const run = this.flushTail.then(
      () => this.drainFlushes(),
      () => this.drainFlushes(),
    )
    this.flushTail = run.catch(() => undefined)
    return run
  }

  updateFlushIdleTask(): void {
    this.publishTask()
  }

  clear(): void {
    this.assertMutable()
    if (this.getBackgroundDirtyCount() > 0) {
      throw new Error('Cannot clear workspace buffers while unsaved content remains')
    }
    this.records.clear()
    this.bumpMutation()
    this.syncWriteClaims()
    this.setTaskState('idle', null)
  }

  dispose(): void {
    if (this.disposed) return
    if (this.getBackgroundDirtyCount() > 0) {
      const error = new Error('Cannot dispose workspace buffers while unsaved content remains')
      this.setTaskState('error', error.message)
      throw error
    }
    this.disposed = true
    if (this.autoFlushTimer) clearTimeout(this.autoFlushTimer)
    this.autoFlushTimer = null
    releaseWorkspaceWriteOwner(this.ownerId)
    this.records.clear()
    this.listeners.clear()
  }

  private assertMutable(recordKey?: string): void {
    if (this.disposed) throw new Error('Workspace buffers are disposed')
    assertWorkspaceClaimMutationAllowed(this.ownerId, recordKey)
  }

  private bumpMutation(): void {
    this.mutationEpoch += 1
  }

  private cleanRecord(relativePath: string, content: string, revision: number): BufferRecord {
    return {
      baselineContent: content,
      content,
      dirty: false,
      relativePath,
      revision,
      target: { absolutePath: this.options.resolvePath(relativePath), state: null },
    }
  }

  private status(record: BufferRecord): FsBufferStatus {
    return { path: record.relativePath, revision: record.revision, dirty: record.dirty }
  }

  private emit(record: BufferRecord): void {
    const status = this.status(record)
    for (const listener of this.listeners) listener(status)
  }

  private syncWriteClaims(): void {
    const claims: WorkspaceWriteClaim[] = []
    for (const [recordKey, record] of this.records) {
      if (!record.dirty) continue
      claims.push({
        absolutePath: record.target.absolutePath,
        baselineContent: record.baselineContent,
        content: record.content,
        recordKey,
      })
    }
    replaceWorkspaceWriteClaims(this.ownerId, claims)
  }

  private scheduleAutoFlush(delay = AUTO_FLUSH_DELAY_MS): void {
    if (this.disposed || this.autoFlushTimer || this.getBackgroundDirtyCount() === 0) return
    this.autoFlushTimer = setTimeout(() => {
      this.autoFlushTimer = null
      void this.autoFlushMutationRunner(() => this.flush()).catch((error) => {
        this.options.logger.warn('workspace buffer auto-flush failed', { error })
        this.scheduleAutoFlush(AUTO_FLUSH_RETRY_MS)
      })
    }, delay)
  }

  private async drainFlushes(): Promise<void> {
    this.setTaskState('running', null)
    try {
      while (this.getBackgroundDirtyCount() > 0) await this.flushPass()
      this.setTaskState('idle', null)
    } catch (error) {
      this.setTaskState('error', this.options.errorMessage(error))
      throw error
    }
  }

  private flushPass(): Promise<void> {
    return flushWorkspaceBufferPass({
      records: this.records,
      ownerId: this.ownerId,
      options: this.options,
      emit: (record) => this.emit(record),
      syncWriteClaims: () => this.syncWriteClaims(),
    })
  }

  private currentFlushTaskStatus(): BackgroundTaskStatus['status'] {
    return this.taskState.status
  }

  private publishTask(): void {
    const dirtyCount = this.getBackgroundDirtyCount()
    const message =
      this.taskState.message ??
      (this.currentFlushTaskStatus() === 'idle' && dirtyCount > 0
        ? String(dirtyCount) + ' file(s) waiting to save'
        : null)
    this.options.setTask(FLUSH_TASK_ID, FLUSH_TASK_LABEL, this.currentFlushTaskStatus(), message)
  }

  private setTaskState(status: BackgroundTaskStatus['status'], message: string | null): void {
    this.taskState = { message, status }
    this.publishTask()
  }
}
