import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

import { createTwoFilesPatch, FILE_HEADERS_ONLY } from 'diff'

import type { GitFileChange, GitRepoInfo, GitStatusSnapshot } from '@electron/services/git/types.js'

const MAX_GIT_OUTPUT = 16 * 1024 * 1024

type GitExecResult = {
  stdout: string
  stderr: string
}

type GitExecOptions = {
  allowFailure?: boolean
}

export const emptyRepoInfo: GitRepoInfo = {
  is_repository: false,
  workdir: null,
  git_dir: null,
  branch: null,
  head: null,
}

export const runGit = async (
  cwd: string,
  args: string[],
  options: GitExecOptions = {},
): Promise<GitExecResult> => {
  try {
    return await execGitFile('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: MAX_GIT_OUTPUT,
      shell: false,
      windowsHide: true,
    })
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string }
    if (options.allowFailure) {
      return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? failure.message }
    }
    throw new Error((failure.stderr ?? failure.message).trim(), { cause: error })
  }
}

export const validateRootPath = async (
  value: unknown,
  options: { requireDirectory: boolean },
): Promise<{ path: string; isDirectory: boolean }> => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Path is required.')
  if (value.includes('\0')) throw new Error('Path contains invalid characters.')

  const resolved = path.resolve(value)
  let stat
  try {
    stat = await fs.stat(resolved)
  } catch {
    throw new Error(`Path does not exist: ${resolved}`)
  }

  const isDirectory = stat.isDirectory()
  if (options.requireDirectory && !isDirectory) {
    throw new Error(`Git repository can only be initialized for a directory: ${resolved}`)
  }
  return { path: resolved, isDirectory }
}

export const normalizeRepoRelativePath = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Git path cannot be empty')
  if (value.includes('\0')) throw new Error('Git path contains invalid characters')
  if (path.isAbsolute(value)) throw new Error('Git path must be repository-relative')

  const normalized = path.normalize(value).replaceAll('\\', '/')
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Invalid git path: ${value}`)
  }
  return normalized
}

export const readUtf8IfFile = async (filePath: string): Promise<string> => {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) return ''
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return ''
  }
}

export const parsePorcelainStatus = (stdout: string) => {
  const staged: GitFileChange[] = []
  const unstaged: GitFileChange[] = []
  const untracked: GitFileChange[] = []
  const conflicts: GitFileChange[] = []
  const entries = stdout.split('\0').filter(Boolean)

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? ''
    if (entry.length < 4) continue
    const stagedCode = entry[0] ?? ' '
    const unstagedCode = entry[1] ?? ' '
    let filePath = entry.slice(3)
    let oldPath: string | null = null

    if (stagedCode === 'R' || stagedCode === 'C' || unstagedCode === 'R' || unstagedCode === 'C') {
      oldPath = filePath
      filePath = entries[index + 1] ?? filePath
      index += 1
    }

    if (stagedCode === '?' && unstagedCode === '?') {
      untracked.push({ path: filePath, old_path: oldPath, status: 'untracked', detail: 'worktree' })
      continue
    }

    if (isConflict(stagedCode, unstagedCode)) {
      conflicts.push({
        path: filePath,
        old_path: oldPath,
        status: 'conflicted',
        detail: `${stagedCode}${unstagedCode}`,
      })
      continue
    }

    const stagedStatus = statusFromCode(stagedCode)
    if (stagedStatus) {
      staged.push({ path: filePath, old_path: oldPath, status: stagedStatus, detail: 'index' })
    }

    const unstagedStatus = statusFromCode(unstagedCode)
    if (unstagedStatus) {
      unstaged.push({
        path: filePath,
        old_path: oldPath,
        status: unstagedStatus,
        detail: `${stagedCode}${unstagedCode}`,
      })
    }
  }

  return { staged, unstaged, untracked, conflicts }
}

export const compareChanges = (left: GitFileChange, right: GitFileChange): number => {
  return left.path.localeCompare(right.path)
}

export const emptyStatusSnapshot = (): GitStatusSnapshot => {
  return {
    repo: { ...emptyRepoInfo },
    staged: [],
    unstaged: [],
    untracked: [],
    conflicts: [],
  }
}

export const allCommitChanges = (snapshot: GitStatusSnapshot): GitFileChange[] => {
  const byPath = new Map<string, GitFileChange>()
  for (const change of [...snapshot.staged, ...snapshot.unstaged, ...snapshot.untracked]) {
    byPath.set(change.path, change)
  }
  return [...byPath.values()]
}

export const syntheticUnifiedDiff = (
  filePath: string,
  originalContent: string,
  modifiedContent: string,
): string => {
  if (originalContent === modifiedContent) return ''

  const oldPath = originalContent ? `a/${filePath}` : '/dev/null'
  const newPath = modifiedContent ? `b/${filePath}` : '/dev/null'
  return createTwoFilesPatch(
    oldPath,
    newPath,
    originalContent,
    modifiedContent,
    undefined,
    undefined,
    {
      context: Number.MAX_SAFE_INTEGER,
      headerOptions: FILE_HEADERS_ONLY,
    },
  )
}

const execGitFile = (
  file: string,
  args: string[],
  options: {
    cwd: string
    encoding: 'utf8'
    maxBuffer: number
    shell: false
    windowsHide: true
  },
): Promise<GitExecResult> => {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }))
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

const statusFromCode = (code: string): GitFileChange['status'] | null => {
  if (code === 'A') return 'added'
  if (code === 'M' || code === 'T') return 'modified'
  if (code === 'D') return 'deleted'
  if (code === 'R') return 'renamed'
  if (code === 'C') return 'copied'
  return null
}

const isConflict = (stagedCode: string, unstagedCode: string): boolean => {
  return (
    stagedCode === 'U' ||
    unstagedCode === 'U' ||
    stagedCode + unstagedCode === 'AA' ||
    stagedCode + unstagedCode === 'DD'
  )
}
