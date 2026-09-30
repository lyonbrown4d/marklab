import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import {
  localHistoryFileDirectory,
  normalizeLocalHistoryPath,
  validateLocalHistoryEntryId,
} from '@electron/services/localHistory/paths.js'
import type {
  LocalHistoryCaptureResult,
  LocalHistoryEntry,
  LocalHistoryServiceContract,
  LocalHistoryServiceOptions,
  LocalHistorySnapshot,
  LocalHistoryWorkspace,
} from '@electron/services/localHistory/types.js'

export const DEFAULT_LOCAL_HISTORY_MAX_ENTRIES = 50
export const DEFAULT_LOCAL_HISTORY_MAX_FILE_SIZE_BYTES = 256 * 1024
export const DEFAULT_LOCAL_HISTORY_MERGE_WINDOW_MS = 10_000

const operationTails = new Map<string, Promise<void>>()

export class LocalHistoryService implements LocalHistoryServiceContract {
  private readonly maxEntriesPerFile: number
  private readonly maxFileSizeBytes: number
  private readonly mergeWindowMs: number
  private readonly now: () => number
  private readonly storageRoot: string

  constructor(options: LocalHistoryServiceOptions) {
    if (!path.isAbsolute(options.userDataPath)) {
      throw new Error('Local history userData path must be absolute')
    }
    this.storageRoot = path.join(path.resolve(options.userDataPath), 'local-history-v1')
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

    const normalizedPath = normalizeLocalHistoryPath(filePath)
    const directory = localHistoryFileDirectory(this.storageRoot, workspace, normalizedPath)
    return withFileLock(directory, async () => {
      const entries = await readSnapshots(directory)
      const contentHash = createHash('sha256').update(content).digest('hex')
      const latest = entries[0]
      if (latest?.content_hash === contentHash) {
        return { status: 'skipped', reason: 'duplicate' }
      }

      const createdAtMs = this.now()
      const snapshot: LocalHistorySnapshot = {
        id: `${String(createdAtMs).padStart(13, '0')}-${randomUUID()}`,
        path: normalizedPath,
        created_at: new Date(createdAtMs).toISOString(),
        size_bytes: sizeBytes,
        content_hash: contentHash,
        source: 'save',
        content,
      }
      await writeSnapshotAtomically(directory, snapshot)

      const shouldMerge = latest
        ? isInsideMergeWindow(latest, createdAtMs, this.mergeWindowMs)
        : false
      if (shouldMerge && latest) await removeSnapshot(directory, latest.id)
      const retained = (await readSnapshots(directory)).slice(this.maxEntriesPerFile)
      await Promise.all(retained.map((entry) => removeSnapshot(directory, entry.id)))
      return {
        status: shouldMerge ? 'merged' : 'created',
        entry: toEntry(snapshot),
      }
    })
  }

  async list(workspace: LocalHistoryWorkspace, filePath: unknown): Promise<LocalHistoryEntry[]> {
    const normalizedPath = normalizeLocalHistoryPath(filePath)
    const directory = localHistoryFileDirectory(this.storageRoot, workspace, normalizedPath)
    return withFileLock(directory, async () =>
      (await readSnapshots(directory))
        .filter((snapshot) => snapshot.path === normalizedPath)
        .map(toEntry),
    )
  }

  async read(
    workspace: LocalHistoryWorkspace,
    filePath: unknown,
    entryId: unknown,
  ): Promise<LocalHistorySnapshot> {
    const normalizedPath = normalizeLocalHistoryPath(filePath)
    const safeEntryId = validateLocalHistoryEntryId(entryId)
    const directory = localHistoryFileDirectory(this.storageRoot, workspace, normalizedPath)
    return withFileLock(directory, async () => {
      const snapshot = await readSnapshot(directory, safeEntryId)
      if (snapshot.path !== normalizedPath) throw new Error('Local history entry path mismatch')
      return snapshot
    })
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
    const normalizedPath = normalizeLocalHistoryPath(filePath)
    const safeEntryId = validateLocalHistoryEntryId(entryId)
    const directory = localHistoryFileDirectory(this.storageRoot, workspace, normalizedPath)
    return withFileLock(directory, async () => {
      await readSnapshot(directory, safeEntryId)
      await removeSnapshot(directory, safeEntryId)
      return { ok: true }
    })
  }

  async clear(workspace: LocalHistoryWorkspace, filePath: unknown): Promise<{ deleted: number }> {
    const normalizedPath = normalizeLocalHistoryPath(filePath)
    const directory = localHistoryFileDirectory(this.storageRoot, workspace, normalizedPath)
    return withFileLock(directory, async () => {
      const deleted = (await readSnapshots(directory)).length
      await fs.rm(directory, { force: true, recursive: true })
      return { deleted }
    })
  }
}

const writeSnapshotAtomically = async (
  directory: string,
  snapshot: LocalHistorySnapshot,
): Promise<void> => {
  await fs.mkdir(directory, { recursive: true })
  const target = path.join(directory, `${snapshot.id}.json`)
  const temporary = path.join(directory, `${snapshot.id}.tmp-${randomUUID()}`)
  try {
    await fs.writeFile(temporary, JSON.stringify(snapshot), { encoding: 'utf8', flag: 'wx' })
    await fs.rename(temporary, target)
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined)
  }
}

const readSnapshots = async (directory: string): Promise<LocalHistorySnapshot[]> => {
  let names: string[]
  try {
    names = await fs.readdir(directory)
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
  const snapshots = await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map((name) => readStoredSnapshot(path.join(directory, name))),
  )
  return snapshots
    .filter((snapshot): snapshot is LocalHistorySnapshot => snapshot !== null)
    .sort(
      (left, right) =>
        right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id),
    )
}

const readSnapshot = async (directory: string, entryId: string): Promise<LocalHistorySnapshot> => {
  const snapshot = await readStoredSnapshot(path.join(directory, `${entryId}.json`))
  if (!snapshot) throw new Error(`Local history entry not found: ${entryId}`)
  return snapshot
}

const readStoredSnapshot = async (filePath: string): Promise<LocalHistorySnapshot | null> => {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filePath, 'utf8'))
    return isSnapshot(parsed) ? parsed : null
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) return null
    throw error
  }
}

const removeSnapshot = (directory: string, entryId: string): Promise<void> =>
  fs.rm(path.join(directory, `${entryId}.json`), { force: true })

const toEntry = (snapshot: LocalHistorySnapshot): LocalHistoryEntry => ({
  id: snapshot.id,
  path: snapshot.path,
  created_at: snapshot.created_at,
  size_bytes: snapshot.size_bytes,
  content_hash: snapshot.content_hash,
  source: snapshot.source,
})

const isSnapshot = (value: unknown): value is LocalHistorySnapshot => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.path === 'string' &&
    typeof record.created_at === 'string' &&
    typeof record.size_bytes === 'number' &&
    typeof record.content_hash === 'string' &&
    record.source === 'save' &&
    typeof record.content === 'string'
  )
}

const isInsideMergeWindow = (
  latest: LocalHistorySnapshot,
  createdAtMs: number,
  mergeWindowMs: number,
): boolean => {
  const elapsed = createdAtMs - Date.parse(latest.created_at)
  return elapsed >= 0 && elapsed <= mergeWindowMs
}

const positiveInteger = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback

const nonNegativeInteger = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback

const isMissing = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')

const withFileLock = async <T>(key: string, work: () => Promise<T>): Promise<T> => {
  const previous = operationTails.get(key) ?? Promise.resolve()
  let release: () => void = () => undefined
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  const next = previous.catch(() => undefined).then(() => barrier)
  operationTails.set(key, next)
  await previous.catch(() => undefined)
  try {
    return await work()
  } finally {
    release()
    if (operationTails.get(key) === next) operationTails.delete(key)
  }
}
