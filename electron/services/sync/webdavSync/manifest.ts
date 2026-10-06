import { z } from 'zod'

import type { SyncManifest, SyncManifestEntry } from '@electron/services/sync/core/types'
import { WorkspaceSyncError } from '@electron/services/sync/core/types'
import {
  normalizeSyncPath,
  portableSyncPathKey,
} from '@electron/services/sync/webdavSync/pathSafety'

const entrySchema = z
  .object({
    path: z.string().min(1).max(4_096),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    modifiedAt: z.iso.datetime(),
    etag: z.string().min(1).max(2_048).optional(),
    deletedAt: z.iso.datetime().optional(),
    deviceId: z.string().min(1).max(128),
    storage: z.literal('object').optional(),
  })
  .strict()

const manifestSchema = z
  .object({
    version: z.literal(1),
    deviceId: z.string().min(1).max(128),
    updatedAt: z.iso.datetime(),
    entries: z.array(entrySchema).max(1_000_000),
  })
  .strict()

export const parseSyncManifest = (value: unknown): SyncManifest => {
  const parsed = manifestSchema.safeParse(value)
  if (!parsed.success) throw new WorkspaceSyncError('validation', 'Invalid sync manifest')
  const seen = new Set<string>()
  const entries = parsed.data.entries.map((entry) => {
    let normalized: string
    try {
      normalized = normalizeSyncPath(entry.path)
    } catch {
      throw new WorkspaceSyncError('validation', 'Invalid manifest path')
    }
    const portableKey = portableSyncPathKey(normalized)
    if (seen.has(portableKey)) {
      throw new WorkspaceSyncError('validation', 'Duplicate or conflicting manifest path')
    }
    seen.add(portableKey)
    return { ...entry, path: normalized }
  })
  return { ...parsed.data, entries }
}

export const assertCompatibleSyncPaths = (
  ...collections: ReadonlyArray<ReadonlyArray<{ path: string }>>
): void => {
  const seen = new Map<string, string>()
  for (const collection of collections) {
    for (const entry of collection) {
      let normalized: string
      try {
        normalized = normalizeSyncPath(entry.path)
      } catch {
        throw new WorkspaceSyncError('validation', 'Invalid sync path')
      }
      const key = portableSyncPathKey(normalized)
      const existing = seen.get(key)
      if (existing && existing !== normalized) {
        throw new WorkspaceSyncError('validation', 'Conflicting portable sync paths')
      }
      seen.set(key, normalized)
    }
  }
}

export const entriesByPath = (entries: SyncManifestEntry[]): Map<string, SyncManifestEntry> =>
  new Map(entries.map((entry) => [entry.path, entry]))
