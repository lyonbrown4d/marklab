import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

import type {
  LocalSyncState,
  LocalSyncStateStore,
  SyncConflict,
} from '@electron/services/sync/core/types.js'
import { parseSyncManifest } from '@electron/services/sync/webdavSync/manifest.js'
import {
  normalizeSyncPath,
  portableSyncPathKey,
} from '@electron/services/sync/webdavSync/pathSafety.js'

const conflictSchema = z
  .object({
    path: z.string().min(1).max(4_096),
    status: z.literal('unresolved'),
    reason: z.enum(['both_changed', 'delete_vs_change']),
    conflictPath: z.string().min(1).max(4_096).optional(),
    localHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    remoteHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()

const stateSchema = z
  .object({
    version: z.literal(1),
    remoteManifestEtag: z.string().min(1).max(2_048).optional(),
    baseline: z.array(z.unknown()).max(1_000_000),
    unresolvedConflicts: z.array(conflictSchema).max(100_000).optional(),
    updatedAt: z.iso.datetime(),
  })
  .strict()

export class FileLocalSyncStateStore implements LocalSyncStateStore {
  private readonly directory: string

  constructor(userDataPath: string) {
    if (!path.isAbsolute(userDataPath)) throw new Error('Sync state path must be absolute')
    this.directory = path.join(path.resolve(userDataPath), 'sync', 'webdav')
  }

  async load(root: string): Promise<LocalSyncState | null> {
    try {
      const parsed = stateSchema.parse(JSON.parse(await fs.readFile(this.filePath(root), 'utf8')))
      const baseline = parseSyncManifest({
        version: 1,
        deviceId: 'local-state',
        updatedAt: parsed.updatedAt,
        entries: parsed.baseline,
      }).entries
      return { ...parsed, baseline, ...validatedConflictProperty(parsed.unresolvedConflicts) }
    } catch (error) {
      if (isMissing(error)) return null
      throw new Error('Local sync state is invalid', { cause: error })
    }
  }

  async save(root: string, state: LocalSyncState): Promise<void> {
    const parsed = stateSchema.parse(state)
    const persisted = { ...parsed, ...validatedConflictProperty(parsed.unresolvedConflicts) }
    parseSyncManifest({
      version: 1,
      deviceId: 'local-state',
      updatedAt: persisted.updatedAt,
      entries: persisted.baseline,
    })
    await fs.mkdir(this.directory, { recursive: true })
    const destination = this.filePath(root)
    const temporary = `${destination}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temporary, `${JSON.stringify(persisted, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      })
      await fs.rename(temporary, destination)
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined)
    }
  }

  private filePath(root: string): string {
    const key = createHash('sha256').update(canonicalWorkspaceStateKey(root)).digest('hex')
    return path.join(this.directory, `${key}.json`)
  }
}

const validatedConflictProperty = (
  conflicts: SyncConflict[] | undefined,
): { unresolvedConflicts?: SyncConflict[] } => {
  if (!conflicts) return {}
  const seen = new Set<string>()
  const normalized = conflicts.map((conflict) => {
    const normalizedPath = normalizeSyncPath(conflict.path)
    const portableKey = portableSyncPathKey(normalizedPath)
    if (seen.has(portableKey)) throw new Error('Duplicate unresolved sync conflict path')
    seen.add(portableKey)
    return {
      ...conflict,
      path: normalizedPath,
      ...(conflict.conflictPath ? { conflictPath: normalizeSyncPath(conflict.conflictPath) } : {}),
    }
  })
  return { unresolvedConflicts: normalized }
}

export const canonicalWorkspaceStateKey = (
  root: string,
  platform: NodeJS.Platform = process.platform,
): string => {
  const resolved = platform === 'win32' ? path.win32.resolve(root) : path.resolve(root)
  const normalized = resolved.normalize('NFC').replaceAll('\\', '/')
  return platform === 'win32' || platform === 'darwin' ? normalized.toLowerCase() : normalized
}

const isMissing = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
