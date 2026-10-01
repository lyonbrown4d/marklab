import path from 'node:path'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'

import type { SyncManifestEntry } from '@electron/services/sync/core/types.js'
import { WorkspaceSyncError } from '@electron/services/sync/core/types.js'
import { resolveSafeWorkspaceTarget } from '@electron/services/sync/webdavSync/pathSafety.js'

export const stableConflictPath = (entry: SyncManifestEntry): string => {
  const parsed = path.posix.parse(entry.path)
  const device = safeSegment(entry.deviceId)
  const timestamp = entry.modifiedAt.replace(/[^0-9]/g, '').slice(0, 14)
  const suffix = `${device}-${timestamp}-${entry.hash.slice(0, 8)}`
  return path.posix.join(parsed.dir, `${parsed.name}.conflict-${suffix}${parsed.ext}`)
}

export const availableConflictPath = async (
  root: string,
  entry: SyncManifestEntry,
  signal: AbortSignal,
): Promise<{ path: string; existing: boolean }> => {
  const preferred = stableConflictPath(entry)
  const parsed = path.posix.parse(preferred)
  for (let attempt = 1; attempt <= 10_000; attempt += 1) {
    signal.throwIfAborted()
    const candidate =
      attempt === 1
        ? preferred
        : path.posix.join(parsed.dir, `${parsed.name}-${attempt}${parsed.ext}`)
    const absolute = await resolveSafeWorkspaceTarget(root, candidate)
    try {
      const stats = await fs.stat(absolute)
      if (
        stats.isFile() &&
        stats.size === entry.size &&
        (await hashFile(absolute, signal)) === entry.hash
      ) {
        return { path: candidate, existing: true }
      }
    } catch (error) {
      if (isMissing(error)) return { path: candidate, existing: false }
      throw error
    }
  }
  throw new WorkspaceSyncError('local_io', 'Unable to allocate a unique conflict filename')
}

const safeSegment = (value: string): string => {
  const sanitized = value
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (sanitized || 'remote').slice(0, 48)
}

const hashFile = async (filePath: string, signal: AbortSignal): Promise<string> => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath, { signal })) hash.update(chunk)
  return hash.digest('hex')
}

const isMissing = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
