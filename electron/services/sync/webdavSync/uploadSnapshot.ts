import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { SyncManifestEntry } from '@electron/services/sync/core/types.js'
import { WorkspaceSyncError } from '@electron/services/sync/core/types.js'
import {
  assertWorkspaceRealPathContained,
  resolveSafeWorkspaceTarget,
} from '@electron/services/sync/webdavSync/pathSafety.js'

export type UploadSnapshot = {
  open: () => ReturnType<typeof createReadStream>
  dispose: () => Promise<void>
}

export const createUploadSnapshot = async (
  root: string,
  entry: SyncManifestEntry,
  signal: AbortSignal,
): Promise<UploadSnapshot> => {
  signal.throwIfAborted()
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-upload-'))
  const snapshotPath = path.join(directory, randomUUID())
  try {
    const sourcePath = await resolveSafeWorkspaceTarget(root, entry.path)
    await assertWorkspaceRealPathContained(root, sourcePath)
    await fs.copyFile(sourcePath, snapshotPath)
    await assertWorkspaceRealPathContained(root, sourcePath)
    signal.throwIfAborted()
    const verified = await hashSnapshot(snapshotPath, signal)
    if (verified.size !== entry.size || verified.hash !== entry.hash) {
      throw new WorkspaceSyncError(
        'conflict',
        `Local file changed after it was scanned: ${entry.path}`,
      )
    }
    return {
      open: () => createReadStream(snapshotPath, { signal }),
      dispose: () => fs.rm(directory, { recursive: true, force: true }),
    }
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

const hashSnapshot = async (
  snapshotPath: string,
  signal: AbortSignal,
): Promise<{ hash: string; size: number }> => {
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of createReadStream(snapshotPath, { signal })) {
    hash.update(chunk)
    size += Buffer.byteLength(chunk)
  }
  return { hash: hash.digest('hex'), size }
}
