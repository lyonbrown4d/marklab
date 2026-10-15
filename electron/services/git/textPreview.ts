import { isUtf8 } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'

import { MAX_WORKSPACE_TEXT_PREVIEW_BYTES } from '@/types/workspaceTextPreview'
import { GitOperationError } from '@electron/services/git/errors'

export const MAX_GIT_PREVIEW_BYTES = MAX_WORKSPACE_TEXT_PREVIEW_BYTES

export const assertPreviewSize = (size: number | bigint): void => {
  if (size > MAX_GIT_PREVIEW_BYTES)
    throw new GitOperationError(
      'git_invalid_input',
      'Diff preview unavailable: file exceeds the 1 MiB text preview limit',
    )
}

export const decodeTextPreview = (bytes: Buffer): string => {
  assertPreviewSize(bytes.length)
  if (bytes.includes(0) || !isUtf8(bytes))
    throw new GitOperationError(
      'git_invalid_input',
      'Diff preview unavailable: binary or non-UTF-8 file cannot be displayed as text',
    )
  return bytes.toString('utf8')
}

export const readUtf8RepoFile = async (root: string, relativePath: string): Promise<string> => {
  const canonicalRoot = await fs.realpath(root)
  const segments = relativePath.split('/').filter(Boolean)
  let candidate = canonicalRoot
  let expectedFileIdentity: { dev: bigint; ino: bigint } | null = null

  for (const [index, segment] of segments.entries()) {
    candidate = path.join(candidate, segment)
    let stat
    try {
      stat = await fs.lstat(candidate, { bigint: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
      throw error
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to read a symbolic link from the Git worktree: ${relativePath}`)
    }
    if (index < segments.length - 1 && !stat.isDirectory()) return ''
    if (index === segments.length - 1) {
      if (!stat.isFile()) return ''
      expectedFileIdentity = { dev: stat.dev, ino: stat.ino }
    }
  }

  const canonicalFile = await fs.realpath(candidate)
  const relativeCanonical = path.relative(canonicalRoot, canonicalFile)
  if (
    relativeCanonical === '..' ||
    relativeCanonical.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeCanonical)
  ) {
    throw new Error(`Refusing to read outside the Git worktree: ${relativePath}`)
  }

  const handle = await fs.open(candidate, 'r')
  try {
    const opened = await handle.stat({ bigint: true })
    if (
      !expectedFileIdentity ||
      expectedFileIdentity.dev !== opened.dev ||
      expectedFileIdentity.ino !== opened.ino ||
      !opened.isFile()
    ) {
      throw new Error(`Git worktree path changed while being read: ${relativePath}`)
    }
    assertPreviewSize(opened.size)
    const bytes = Buffer.alloc(MAX_GIT_PREVIEW_BYTES + 1)
    let bytesRead = 0
    // The file can grow after stat; cap the read as well as the size preflight.
    while (bytesRead < bytes.length) {
      const read = await handle.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead)
      if (read.bytesRead === 0) break
      bytesRead += read.bytesRead
    }
    return decodeTextPreview(bytes.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}
