import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { GitOperationError } from '@electron/services/git/errors'
import { readUtf8RepoFile } from '@electron/services/git/helpers'
import { validateWorktreeFile } from '@electron/services/git/pathSafety'
import { decodeTextPreview, MAX_GIT_PREVIEW_BYTES } from '@electron/services/git/textPreview'

const staleResult = (): GitOperationError =>
  new GitOperationError(
    'git_invalid_input',
    'Conflict result changed outside this editor; refresh before saving',
  )

export const writeConflictFile = async (
  root: string,
  file: string,
  bytes: Buffer,
  expected: { result: string; deleted: boolean },
  deleteFile: boolean,
  newFileMode: number,
): Promise<void> => {
  await validateWorktreeFile(root, file)
  const target = path.join(root, file)
  const existing = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!!existing === expected.deleted) throw staleResult()
  if (deleteFile) {
    if (!existing) return
    if ((await readUtf8RepoFile(root, file)) !== expected.result) throw staleResult()
    await validateWorktreeFile(root, file)
    const current = await fs.lstat(target)
    if (current.dev !== existing.dev || current.ino !== existing.ino) throw staleResult()
    await fs.unlink(target)
    return
  }
  // Opening without truncation lets us verify identity/content before changing an existing file.
  const flags =
    constants.O_RDWR |
    (constants.O_NOFOLLOW ?? 0) |
    (existing ? 0 : constants.O_CREAT | constants.O_EXCL)
  if (!existing) {
    await fs.mkdir(path.dirname(target), { recursive: true })
    await validateWorktreeFile(root, file)
  }
  const handle = await fs.open(target, flags, newFileMode)
  try {
    await validateWorktreeFile(root, file)
    const opened = await handle.stat()
    if (
      !opened.isFile() ||
      (existing && (opened.dev !== existing.dev || opened.ino !== existing.ino))
    )
      throw staleResult()
    if (existing) {
      const original = Buffer.alloc(MAX_GIT_PREVIEW_BYTES + 1)
      let read = 0
      while (read < original.length) {
        const chunk = await handle.read(original, read, original.length - read, read)
        if (!chunk.bytesRead) break
        read += chunk.bytesRead
      }
      if (decodeTextPreview(original.subarray(0, read)) !== expected.result) throw staleResult()
    }
    await handle.writeFile(bytes)
    await handle.truncate(bytes.length)
  } finally {
    await handle.close()
  }
}
