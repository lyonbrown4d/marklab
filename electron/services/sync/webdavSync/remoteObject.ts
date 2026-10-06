import { createHash } from 'node:crypto'

import type { RemoteFileStore, SyncManifestEntry } from '@electron/services/sync/core/types'
import { WorkspaceSyncError } from '@electron/services/sync/core/types'
import { remoteErrorCode, withRemoteRetry } from '@electron/services/sync/webdavSync/retry'
import type { UploadSnapshot } from '@electron/services/sync/webdavSync/uploadSnapshot'

export const ensureRemoteObject = async (
  remote: RemoteFileStore,
  entry: SyncManifestEntry,
  snapshot: UploadSnapshot,
  signal: AbortSignal,
): Promise<string | undefined> => {
  const objectPath = remoteContentPath({ ...entry, storage: 'object' })
  const existing = await readObjectMetadata(remote, objectPath, entry, signal).catch(
    (error: unknown) => {
      if (remoteErrorCode(error) === 'not_found') return null
      throw error
    },
  )
  if (existing !== null) return existing
  try {
    const written = await withRemoteRetry(
      () =>
        remote.write(objectPath, snapshot.open(), {
          signal,
          size: entry.size,
          ifNoneMatch: '*',
        }),
      { signal },
    )
    return written.etag
  } catch (error) {
    if (remoteErrorCode(error) !== 'precondition_failed') throw error
    return readObjectMetadata(remote, objectPath, entry, signal)
  }
}

export const remoteContentPath = (entry: SyncManifestEntry): string =>
  entry.storage === 'object' ? `.marklab-sync/objects/${entry.hash}` : entry.path

const readObjectMetadata = async (
  remote: RemoteFileStore,
  objectPath: string,
  expected: SyncManifestEntry,
  signal: AbortSignal,
): Promise<string | undefined> => {
  const file = await remote.read(objectPath, { signal })
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of file.body) {
    hash.update(chunk)
    size += Buffer.byteLength(chunk)
    if (size > expected.size) break
  }
  if (size !== expected.size || hash.digest('hex') !== expected.hash) {
    throw new WorkspaceSyncError('conflict', 'Remote content object failed integrity verification')
  }
  return file.etag
}
