import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { SyncManifestEntry, SyncSkippedFile } from '@electron/services/sync/core/types.js'
import { WorkspaceSyncError } from '@electron/services/sync/core/types.js'
import {
  assertWorkspaceRealPathContained,
  isProtectedSyncSegment,
  normalizeSyncPath,
  portableSyncPathKey,
} from '@electron/services/sync/webdavSync/pathSafety.js'

type ScanOptions = {
  deviceId: string
  maxFileSize: number
  signal?: AbortSignal
}

type FileCandidate = { absolutePath: string; relativePath: string }
const EXCLUDED_DIRECTORIES = new Set(['.cache'])
const TEMPORARY_FILE = /(?:\.tmp|\.temp|\.swp|\.part|~)$/i

export const scanWorkspace = async (
  root: string,
  options: ScanOptions,
): Promise<{ entries: SyncManifestEntry[]; skipped: SyncSkippedFile[] }> => {
  const absoluteRoot = path.resolve(root)
  const entries: SyncManifestEntry[] = []
  const skipped: SyncSkippedFile[] = []
  const portablePaths = new Map<string, string>()
  await assertWorkspaceRealPathContained(absoluteRoot, absoluteRoot)
  for await (const candidate of walkFiles(absoluteRoot, absoluteRoot, '')) {
    options.signal?.throwIfAborted()
    const portableKey = portableSyncPathKey(candidate.relativePath)
    const existing = portablePaths.get(portableKey)
    if (existing) {
      throw new WorkspaceSyncError(
        'validation',
        `Local sync paths conflict on portable filesystems: ${existing} and ${candidate.relativePath}`,
      )
    }
    portablePaths.set(portableKey, candidate.relativePath)
    const before = await safeFileStats(absoluteRoot, candidate.absolutePath)
    if (before.size > options.maxFileSize) {
      skipped.push({ path: candidate.relativePath, reason: 'file_too_large', size: before.size })
      continue
    }
    const hash = await hashFile(candidate.absolutePath, options.signal)
    const after = await safeFileStats(absoluteRoot, candidate.absolutePath)
    if (!sameFile(before, after)) {
      throw new WorkspaceSyncError('local_io', 'Local file changed while preparing sync')
    }
    entries.push({
      path: candidate.relativePath,
      hash,
      size: after.size,
      modifiedAt: after.mtime.toISOString(),
      deviceId: options.deviceId,
    })
  }
  entries.sort((left, right) => left.path.localeCompare(right.path))
  return { entries, skipped }
}

const walkFiles = async function* (
  root: string,
  directory: string,
  syncDirectory: string,
): AsyncGenerator<FileCandidate> {
  await assertWorkspaceRealPathContained(root, directory)
  if (syncDirectory) {
    const stats = await fs.lstat(directory)
    if (stats.isSymbolicLink() || !stats.isDirectory()) return
  }
  const handle = await fs.opendir(directory)
  for await (const entry of handle) {
    if (isExcludedEntry(entry.name)) continue
    const rawRelativePath = syncDirectory ? `${syncDirectory}/${entry.name}` : entry.name
    let relativePath: string
    try {
      relativePath = normalizeSyncPath(rawRelativePath)
    } catch (error) {
      throw new WorkspaceSyncError('validation', 'Local workspace contains a non-portable path', {
        cause: error,
      })
    }
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) yield* walkFiles(root, path.join(directory, entry.name), relativePath)
    else if (entry.isFile() && !TEMPORARY_FILE.test(entry.name)) {
      yield { absolutePath: path.join(directory, entry.name), relativePath }
    }
  }
  await assertWorkspaceRealPathContained(root, directory)
}

const safeFileStats = async (root: string, filePath: string) => {
  await assertWorkspaceRealPathContained(root, filePath)
  const stats = await fs.lstat(filePath)
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new WorkspaceSyncError('validation', 'Local sync candidate is not a regular file')
  }
  await assertWorkspaceRealPathContained(root, filePath)
  return stats
}

const isExcludedEntry = (name: string): boolean =>
  isProtectedSyncSegment(name) || EXCLUDED_DIRECTORIES.has(name.toLowerCase())

const sameFile = (
  left: Awaited<ReturnType<typeof fs.lstat>>,
  right: Awaited<ReturnType<typeof fs.lstat>>,
): boolean =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mtimeMs === right.mtimeMs

const hashFile = async (filePath: string, signal?: AbortSignal): Promise<string> => {
  const hash = createHash('sha256')
  const stream = createReadStream(filePath, { signal })
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}
