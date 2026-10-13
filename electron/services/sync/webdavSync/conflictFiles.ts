import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { TextDecoder } from 'node:util'

import { writeDownloadAtomically } from '@electron/services/sync/webdavSync/atomicDownload'
import { resolveSafeWorkspaceTarget } from '@electron/services/sync/webdavSync/pathSafety'
import type { WorkspaceSyncConflictVersion } from '@/types/workspaceSync'

const PREVIEW_LIMIT = 64 * 1024
const readStream = async (target: string, signal?: AbortSignal) => {
  const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  return handle.createReadStream({ signal, autoClose: true })
}

export const readConflictVersion = async (
  root: string,
  relativePath: string | undefined,
  signal?: AbortSignal,
): Promise<WorkspaceSyncConflictVersion> => {
  const deleted: WorkspaceSyncConflictVersion = {
    hash: null,
    size: 0,
    text: null,
    unavailable: 'deleted',
  }
  if (!relativePath) return deleted
  const target = await resolveSafeWorkspaceTarget(root, relativePath)
  const before = await fs.lstat(target).catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
      return null
    throw error
  })
  if (!before) return deleted
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error('Conflict version is not a regular file')
  const hash = createHash('sha256')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of await readStream(target, signal)) {
    const buffer = Buffer.from(chunk)
    hash.update(buffer)
    size += buffer.length
    if (before.size <= PREVIEW_LIMIT && size <= PREVIEW_LIMIT) chunks.push(buffer)
  }
  const after = await fs.lstat(await resolveSafeWorkspaceTarget(root, relativePath))
  if (
    !after.isFile() ||
    after.isSymbolicLink() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    size !== after.size
  ) {
    throw new Error('Conflict version changed while reading; review it again')
  }
  const version = { hash: hash.digest('hex'), size, text: null, unavailable: null }
  if (size > PREVIEW_LIMIT) return { ...version, unavailable: 'too_large' }
  const buffer = Buffer.concat(chunks)
  try {
    if (buffer.includes(0)) throw new Error('binary')
    return { ...version, text: new TextDecoder('utf-8', { fatal: true }).decode(buffer) }
  } catch {
    return { ...version, unavailable: 'binary' }
  }
}

export const assertConflictHash = async (
  root: string,
  relativePath: string | undefined,
  expected: string | null,
  signal?: AbortSignal,
): Promise<void> => {
  if ((await readConflictVersion(root, relativePath, signal)).hash !== expected) {
    throw new Error('Conflict version changed; review it again')
  }
}

export const preserveLocalConflict = async (
  root: string,
  relativePath: string,
  version: WorkspaceSyncConflictVersion,
  beforePublish: () => Promise<void>,
  signal: AbortSignal,
): Promise<string | undefined> => {
  if (!version.hash) return undefined
  const parsed = path.posix.parse(relativePath)
  const backupPath = path.posix.join(
    parsed.dir,
    `${parsed.name}.resolved-local-${randomUUID()}${parsed.ext}`,
  )
  const target = await resolveSafeWorkspaceTarget(root, relativePath)
  await writeDownloadAtomically({
    root,
    relativePath: backupPath,
    source: await readStream(target, signal),
    expectedHash: version.hash,
    expectedSize: version.size,
    overwrite: false,
    signal,
    beforePublish,
  })
  return backupPath
}

export const applySavedRemoteConflict = async (
  root: string,
  relativePath: string,
  savedPath: string | undefined,
  version: WorkspaceSyncConflictVersion,
  beforePublish: () => Promise<void>,
  signal: AbortSignal,
): Promise<void> => {
  if (version.hash && savedPath) {
    const source = await resolveSafeWorkspaceTarget(root, savedPath)
    await writeDownloadAtomically({
      root,
      relativePath,
      source: await readStream(source, signal),
      expectedHash: version.hash,
      expectedSize: version.size,
      overwrite: true,
      signal,
      beforePublish,
    })
  } else {
    await beforePublish()
    await fs.rm(await resolveSafeWorkspaceTarget(root, relativePath), { force: true })
  }
}
