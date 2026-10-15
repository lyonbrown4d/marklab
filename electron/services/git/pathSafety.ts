import fs from 'node:fs/promises'
import path from 'node:path'

import { GitOperationError } from '@electron/services/git/errors'
import { runGit } from '@electron/services/git/helpers'
import type { GitStatusSnapshot } from '@electron/services/git/types'

export const validateFilePath = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value.length > 32_768 || value.includes('\0')) {
    throw new GitOperationError('git_invalid_input', 'Invalid Git file path')
  }
  const segments = value.split('/')
  // Windows normalizes trailing dots/spaces and exposes alternate data streams.
  // Reject those spellings before they can alias metadata or another file.
  const unsafeWindowsComponent =
    process.platform === 'win32' &&
    segments.some(
      (segment) => /[<>:"|?*]/.test(segment) || /[. ]$/.test(segment) || /^git~\d+$/i.test(segment),
    )
  if (
    unsafeWindowsComponent ||
    path.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    value.includes('\\') ||
    segments.some(
      (segment) =>
        !segment || segment === '.' || segment === '..' || segment.toLowerCase() === '.git',
    )
  ) {
    throw new GitOperationError(
      'git_workspace_boundary',
      'Git path must name a file inside the worktree',
    )
  }
  return value
}

export const validateWorktreeFile = async (root: string, relative: string): Promise<void> => {
  const segments = relative.split('/')
  let candidate = root
  // Ancestors must be inspected in order: realpath alone would follow unsafe symlinks.
  for (const [index, segment] of segments.entries()) {
    candidate = path.join(candidate, segment)
    const stat = await fs.lstat(candidate).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (!stat) break // Deleted tracked files are valid selections.
    if (
      stat.isSymbolicLink() ||
      (index === segments.length - 1 ? !stat.isFile() : !stat.isDirectory())
    ) {
      throw new GitOperationError(
        'git_workspace_boundary',
        `Refusing symlink, directory or special file: ${relative}`,
      )
    }
  }
}

export const validateSelectedPaths = async (
  root: string,
  input: unknown,
  snapshot: GitStatusSnapshot,
): Promise<string[]> => {
  if (!Array.isArray(input) || input.length === 0 || input.length > 10_000) {
    throw new GitOperationError('git_invalid_input', 'Select between 1 and 10000 Git files')
  }
  const paths = new Set(input.map(validateFilePath))
  for (const change of [...snapshot.staged, ...snapshot.unstaged, ...snapshot.conflicts]) {
    if (change.old_path && (paths.has(change.path) || paths.has(change.old_path))) {
      paths.add(validateFilePath(change.path))
      paths.add(validateFilePath(change.old_path))
    }
  }
  const entries = (await runGit(root, ['ls-files', '--stage', '-z'])).stdout.split('\0')
  const submodules = entries
    .filter((entry) => entry.startsWith('160000 '))
    .map((entry) => entry.slice(entry.indexOf('\t') + 1))
  const result = [...paths]
  if (
    result.some((file) =>
      submodules.some((module) => file === module || file.startsWith(`${module}/`)),
    )
  ) {
    throw new GitOperationError('git_workspace_boundary', 'Submodule paths cannot be changed here')
  }
  // Bound filesystem validation to avoid unbounded descriptor pressure for large selections.
  for (let offset = 0; offset < result.length; offset += 32) {
    await Promise.all(
      result.slice(offset, offset + 32).map((file) => validateWorktreeFile(root, file)),
    )
  }
  return result
}

export const removeUntrackedFile = async (root: string, relative: string): Promise<void> => {
  await validateWorktreeFile(root, relative)
  const file = path.join(root, relative)
  const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (stat?.isFile()) await fs.unlink(file)
}
