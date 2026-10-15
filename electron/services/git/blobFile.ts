import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { buildSafeGitArgs } from '@electron/services/git/gitPolicy'
import { GitOperationError } from '@electron/services/git/errors'
import { readObjectMetadata } from '@electron/services/git/blobPreview'

// Only resolved blob hashes are accepted; no filters, hooks, text conversion or shell.
export const writeGitBlobFile = async (
  root: string,
  hash: string,
  target: string,
  signal?: AbortSignal,
): Promise<void> => {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(hash)) throw new Error('Invalid Git blob hash')
  const metadata = await readObjectMetadata(root, hash)
  signal?.throwIfAborted()
  if (!metadata || metadata.type !== 'blob') throw new Error('Git file version is unavailable')
  const child = spawn('git', await buildSafeGitArgs(['cat-file', 'blob', metadata.hash]), {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
    signal,
  })
  child.stderr.resume()
  const exited = new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            new GitOperationError(
              'git_command_failed',
              'Unable to read the selected Git file version',
            ),
          ),
    )
  })
  try {
    await Promise.all([
      pipeline(child.stdout, createWriteStream(target, { flags: 'wx', mode: 0o600 }), { signal }),
      exited,
    ])
    if ((await fs.stat(target)).size !== metadata.size)
      throw new Error('Git file version changed while reading')
    await fs.chmod(target, 0o400)
  } catch (error) {
    child.kill()
    await fs.rm(target, { force: true })
    throw error
  }
}
