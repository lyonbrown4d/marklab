import { createHash } from 'node:crypto'

import type {
  RemoteFileStore,
  SyncManifestEntry,
  SyncSkippedFile,
} from '@electron/services/sync/core/types.js'
import { normalizeSyncPath } from '@electron/services/sync/webdavSync/pathSafety.js'

export const scanRemoteStore = async (
  remote: RemoteFileStore,
  options: { signal: AbortSignal; maxFileSize: number },
): Promise<{
  entries: SyncManifestEntry[]
  internalMetadataFound: boolean
  skipped: SyncSkippedFile[]
}> => {
  const entries: SyncManifestEntry[] = []
  const skipped: SyncSkippedFile[] = []
  let internalMetadataFound = false
  for await (const item of remote.list({ signal: options.signal })) {
    options.signal.throwIfAborted()
    if (internalMetadataPath(item.path)) {
      internalMetadataFound = true
      continue
    }
    const relativePath = normalizeSyncPath(item.path)
    if (item.size > options.maxFileSize) {
      skipped.push({ path: relativePath, reason: 'file_too_large', size: item.size })
      continue
    }
    const file = await remote.read(relativePath, { signal: options.signal })
    const hash = createHash('sha256')
    let size = 0
    for await (const chunk of file.body) {
      hash.update(chunk)
      size += Buffer.byteLength(chunk)
      if (size > options.maxFileSize) throw new Error('Remote file exceeds sync size limit')
    }
    entries.push({
      path: relativePath,
      hash: hash.digest('hex'),
      size,
      modifiedAt: item.modifiedAt,
      deviceId: 'remote-bootstrap',
      ...(item.etag ? { etag: item.etag } : {}),
    })
  }
  return { entries, internalMetadataFound, skipped }
}

const internalMetadataPath = (value: string): boolean =>
  value.normalize('NFC').replaceAll('\\', '/').replace(/^\/+/, '').startsWith('.marklab-sync/')
