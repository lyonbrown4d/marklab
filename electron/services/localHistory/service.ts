import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'

import {
  openLocalHistoryDatabase,
  type LocalHistoryDatabase,
} from '@electron/services/localHistory/database'
import {
  normalizeLocalHistoryPath,
  normalizeLocalHistoryWorkspace,
  validateLocalHistoryEntryId,
} from '@electron/services/localHistory/paths'
import {
  LocalHistoryStore,
  type LocalHistoryDocumentIdentity,
} from '@electron/services/localHistory/store'
import type {
  LocalHistoryCaptureResult,
  LocalHistoryEntry,
  LocalHistoryServiceContract,
  LocalHistoryServiceOptions,
  LocalHistorySnapshot,
  LocalHistoryWorkspace,
} from '@electron/services/localHistory/types'

export const DEFAULT_LOCAL_HISTORY_MAX_ENTRIES = 50
export const DEFAULT_LOCAL_HISTORY_MAX_FILE_SIZE_BYTES = 256 * 1024
export const DEFAULT_LOCAL_HISTORY_MERGE_WINDOW_MS = 10_000

export class LocalHistoryService implements LocalHistoryServiceContract {
  private readonly database: LocalHistoryDatabase
  private readonly maxEntriesPerFile: number
  private readonly maxFileSizeBytes: number
  private readonly mergeWindowMs: number
  private readonly now: () => number
  private readonly repository: LocalHistoryStore

  constructor(options: LocalHistoryServiceOptions) {
    if (!path.isAbsolute(options.userDataPath)) {
      throw new Error('Local history userData path must be absolute')
    }
    this.database = openLocalHistoryDatabase(options.userDataPath)
    this.repository = new LocalHistoryStore(this.database)
    this.maxEntriesPerFile = positiveInteger(
      options.maxEntriesPerFile,
      DEFAULT_LOCAL_HISTORY_MAX_ENTRIES,
    )
    this.maxFileSizeBytes = positiveInteger(
      options.maxFileSizeBytes,
      DEFAULT_LOCAL_HISTORY_MAX_FILE_SIZE_BYTES,
    )
    this.mergeWindowMs = nonNegativeInteger(
      options.mergeWindowMs,
      DEFAULT_LOCAL_HISTORY_MERGE_WINDOW_MS,
    )
    this.now = options.now ?? Date.now
  }

  initialize(): Promise<void> {
    return this.database.ready
  }

  dispose(): Promise<void> {
    return this.database.dispose()
  }

  async capture(
    workspace: LocalHistoryWorkspace,
    filePath: unknown,
    content: string,
  ): Promise<LocalHistoryCaptureResult> {
    if (typeof content !== 'string') throw new Error('Local history content must be a string')
    const sizeBytes = Buffer.byteLength(content, 'utf8')
    if (sizeBytes > this.maxFileSizeBytes) {
      return { status: 'skipped', reason: 'file-too-large' }
    }

    const identity = documentIdentity(workspace, filePath)
    const createdAtMs = this.now()
    const snapshot: LocalHistorySnapshot = {
      id: `${String(createdAtMs).padStart(13, '0')}-${randomUUID()}`,
      path: identity.filePath,
      created_at: new Date(createdAtMs).toISOString(),
      size_bytes: sizeBytes,
      content_hash: createHash('sha256').update(content).digest('hex'),
      source: 'save',
      content,
    }
    const status = await this.repository.capture(
      identity,
      snapshot,
      createdAtMs,
      this.mergeWindowMs,
      this.maxEntriesPerFile,
    )
    if (status === 'duplicate') return { status: 'skipped', reason: 'duplicate' }
    return { status, entry: toEntry(snapshot) }
  }

  async list(workspace: LocalHistoryWorkspace, filePath: unknown): Promise<LocalHistoryEntry[]> {
    const snapshots = await this.repository.list(documentIdentity(workspace, filePath))
    return snapshots.map(toEntry)
  }

  async read(
    workspace: LocalHistoryWorkspace,
    filePath: unknown,
    entryId: unknown,
  ): Promise<LocalHistorySnapshot> {
    const safeEntryId = validateLocalHistoryEntryId(entryId)
    const snapshot = await this.repository.read(documentIdentity(workspace, filePath), safeEntryId)
    if (!snapshot) throw new Error(`Local history entry not found: ${safeEntryId}`)
    return snapshot
  }

  async restore(
    workspace: LocalHistoryWorkspace,
    filePath: unknown,
    entryId: unknown,
    write: (content: string) => Promise<void>,
  ): Promise<LocalHistorySnapshot> {
    const snapshot = await this.read(workspace, filePath, entryId)
    await write(snapshot.content)
    return snapshot
  }

  async delete(
    workspace: LocalHistoryWorkspace,
    filePath: unknown,
    entryId: unknown,
  ): Promise<{ ok: true }> {
    const safeEntryId = validateLocalHistoryEntryId(entryId)
    const deleted = await this.repository.delete(documentIdentity(workspace, filePath), safeEntryId)
    if (!deleted) throw new Error(`Local history entry not found: ${safeEntryId}`)
    return { ok: true }
  }

  async clear(workspace: LocalHistoryWorkspace, filePath: unknown): Promise<{ deleted: number }> {
    const deleted = await this.repository.clear(documentIdentity(workspace, filePath))
    return { deleted }
  }
}

const documentIdentity = (
  workspace: LocalHistoryWorkspace,
  filePath: unknown,
): LocalHistoryDocumentIdentity => ({
  workspaceKind: workspace.kind,
  workspacePath: normalizeLocalHistoryWorkspace(workspace),
  filePath: normalizeLocalHistoryPath(filePath),
})

const toEntry = (snapshot: LocalHistorySnapshot): LocalHistoryEntry => ({
  id: snapshot.id,
  path: snapshot.path,
  created_at: snapshot.created_at,
  size_bytes: snapshot.size_bytes,
  content_hash: snapshot.content_hash,
  source: snapshot.source,
})

const positiveInteger = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback

const nonNegativeInteger = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
