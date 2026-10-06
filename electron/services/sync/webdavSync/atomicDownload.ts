import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { WorkspaceSyncError } from '@electron/services/sync/core/types'
import { resolveSafeWorkspaceTarget } from '@electron/services/sync/webdavSync/pathSafety'

type AtomicDownloadOptions = {
  beforePublish?: () => Promise<void>
  root: string
  relativePath: string
  source: Readable
  expectedHash: string
  expectedSize: number
  overwrite?: boolean
  signal?: AbortSignal
}

export const writeDownloadAtomically = async (options: AtomicDownloadOptions): Promise<string> => {
  const destination = await resolveSafeWorkspaceTarget(options.root, options.relativePath)
  await fsPromises.mkdir(path.dirname(destination), { recursive: true })
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${randomUUID()}.part`,
  )
  const hash = createHash('sha256')
  let size = 0
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk)
      size += chunk.byteLength
      callback(null, chunk)
    },
  })
  try {
    await pipeline(
      options.source,
      meter,
      fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
      { signal: options.signal },
    )
    if (size !== options.expectedSize || hash.digest('hex') !== options.expectedHash) {
      throw new WorkspaceSyncError('remote_io', 'Downloaded file integrity verification failed')
    }
    await options.beforePublish?.()
    if (options.overwrite === false) {
      await fsPromises.copyFile(temporary, destination, fs.constants.COPYFILE_EXCL)
      await fsPromises.rm(temporary, { force: true })
    } else {
      await fsPromises.rename(temporary, destination)
    }
    return destination
  } finally {
    await fsPromises.rm(temporary, { force: true }).catch(() => undefined)
  }
}
