import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

import { createTwoFilesPatch, FILE_HEADERS_ONLY } from 'diff'

import type { GitFileChange, GitFileDiff, GitRepoInfo, GitStatusSnapshot } from './types.js'

const MAX_GIT_OUTPUT = 16 * 1024 * 1024

type GitExecResult = {
  stdout: string
  stderr: string
}

type GitExecOptions = {
  allowFailure?: boolean
}

const emptyRepoInfo: GitRepoInfo = {
  is_repository: false,
  workdir: null,
  git_dir: null,
  branch: null,
  head: null,
}

export class GitService {
  async discover(rootPath: unknown): Promise<GitRepoInfo> {
    const root = await validateRootPath(rootPath, { requireDirectory: false })
    if (!root.isDirectory) return { ...emptyRepoInfo }

    const isRepo = await this.isRepository(root.path)
    if (!isRepo) return { ...emptyRepoInfo }

    return this.repoInfo(root.path)
  }

  async init(rootPath: unknown): Promise<GitRepoInfo> {
    const root = await validateRootPath(rootPath, { requireDirectory: true })
    if (await this.isRepository(root.path)) return this.repoInfo(root.path)

    const initWithMain = await runGit(root.path, ['init', '-b', 'main'], { allowFailure: true })
    if (initWithMain.stderr && initWithMain.stderr.includes('unknown switch')) {
      await runGit(root.path, ['init'])
    } else if (initWithMain.stderr && !(await this.isRepository(root.path))) {
      throw new Error(`Failed to initialize git repository: ${initWithMain.stderr.trim()}`)
    }

    return this.repoInfo(root.path)
  }

  async status(rootPath: unknown): Promise<GitStatusSnapshot> {
    const root = await validateRootPath(rootPath, { requireDirectory: false })
    if (!root.isDirectory || !(await this.isRepository(root.path))) {
      return emptyStatusSnapshot()
    }

    const repo = await this.repoInfo(root.path)
    const { stdout } = await runGit(root.path, [
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ])
    const changes = parsePorcelainStatus(stdout)

    return {
      repo,
      staged: changes.staged.sort(compareChanges),
      unstaged: changes.unstaged.sort(compareChanges),
      untracked: changes.untracked.sort(compareChanges),
      conflicts: changes.conflicts.sort(compareChanges),
    }
  }

  async fileDiff(rootPath: unknown, filePath: unknown, section: unknown): Promise<GitFileDiff> {
    const root = await validateRootPath(rootPath, { requireDirectory: true })
    if (!(await this.isRepository(root.path))) {
      throw new Error('Failed to discover git repository')
    }

    const safePath = normalizeRepoRelativePath(filePath)
    const workdir = await this.workdir(root.path)
    const worktreePath = path.join(workdir, safePath)
    const headContent = await this.readGitBlob(root.path, `HEAD:${safePath}`)
    const indexContent = await this.readGitBlob(root.path, `:${safePath}`)
    const worktreeContent = await readUtf8IfFile(worktreePath)

    const diffSection = typeof section === 'string' ? section : 'unstaged'
    const labelsAndContent = (() => {
      if (diffSection === 'staged') {
        return {
          original_label: 'HEAD',
          modified_label: 'Index',
          original_content: headContent ?? '',
          modified_content: indexContent ?? '',
        }
      }
      if (diffSection === 'untracked') {
        return {
          original_label: 'Empty',
          modified_label: 'Working Tree',
          original_content: '',
          modified_content: worktreeContent,
        }
      }
      if (diffSection === 'conflicts') {
        return {
          original_label: 'HEAD',
          modified_label: 'Working Tree',
          original_content: headContent ?? '',
          modified_content: worktreeContent,
        }
      }
      return {
        original_label: 'Index',
        modified_label: 'Working Tree',
        original_content: indexContent ?? headContent ?? '',
        modified_content: worktreeContent,
      }
    })()

    const unifiedDiff = await this.unifiedDiff(
      root.path,
      safePath,
      diffSection,
      labelsAndContent.original_content,
      labelsAndContent.modified_content,
    )

    return {
      path: safePath,
      old_path: null,
      ...labelsAndContent,
      unified_diff: unifiedDiff,
    }
  }

  async commitAll(rootPath: unknown, message: unknown): Promise<GitStatusSnapshot> {
    const root = await validateRootPath(rootPath, { requireDirectory: true })
    const commitMessage = typeof message === 'string' ? message.trim() : ''
    if (!commitMessage) throw new Error('Commit message cannot be empty')
    if (!(await this.isRepository(root.path)))
      throw new Error('Current directory is not a Git repository')

    const snapshot = await this.status(root.path)
    if (snapshot.conflicts.length > 0) throw new Error('Cannot commit while conflicts are present')
    if (allCommitChanges(snapshot).length === 0) throw new Error('No changes to commit')

    await runGit(root.path, ['add', '-A'])
    const identityArgs = await this.commitIdentityArgs(root.path)
    await runGit(root.path, [...identityArgs, 'commit', '-m', commitMessage])
    return this.status(root.path)
  }

  private async isRepository(root: string): Promise<boolean> {
    const result = await runGit(root, ['rev-parse', '--is-inside-work-tree'], {
      allowFailure: true,
    })
    return result.stdout.trim() === 'true'
  }

  private async repoInfo(root: string): Promise<GitRepoInfo> {
    const [workdir, gitDir, branch, head] = await Promise.all([
      this.gitValue(root, ['rev-parse', '--show-toplevel']),
      this.gitValue(root, ['rev-parse', '--absolute-git-dir']),
      this.gitValue(root, ['symbolic-ref', '--short', '-q', 'HEAD']),
      this.gitValue(root, ['rev-parse', '--verify', 'HEAD']),
    ])

    return {
      is_repository: true,
      workdir,
      git_dir: gitDir,
      branch,
      head,
    }
  }

  private async workdir(root: string): Promise<string> {
    const workdir = await this.gitValue(root, ['rev-parse', '--show-toplevel'])
    if (!workdir) throw new Error('Git diff requires a repository with a working tree')
    return workdir
  }

  private async gitValue(root: string, args: string[]): Promise<string | null> {
    const result = await runGit(root, args, { allowFailure: true })
    const value = result.stdout.trim()
    return value || null
  }

  private async readGitBlob(root: string, spec: string): Promise<string | null> {
    const result = await runGit(root, ['show', spec], { allowFailure: true })
    if (result.stderr || !result.stdout) return null
    return result.stdout
  }

  private async unifiedDiff(
    root: string,
    filePath: string,
    section: string,
    originalContent: string,
    modifiedContent: string,
  ): Promise<string> {
    if (section === 'untracked') {
      return syntheticUnifiedDiff(filePath, originalContent, modifiedContent)
    }
    const args =
      section === 'staged' ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath]
    const result = await runGit(root, args, { allowFailure: true })
    return result.stdout || syntheticUnifiedDiff(filePath, originalContent, modifiedContent)
  }

  private async commitIdentityArgs(root: string): Promise<string[]> {
    const [name, email] = await Promise.all([
      this.gitValue(root, ['config', 'user.name']),
      this.gitValue(root, ['config', 'user.email']),
    ])
    const args: string[] = []
    if (!name) args.push('-c', 'user.name=marko')
    if (!email) args.push('-c', 'user.email=marko@local')
    return args
  }
}

async function runGit(
  cwd: string,
  args: string[],
  options: GitExecOptions = {},
): Promise<GitExecResult> {
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

function execGitFile(
  file: string,
  args: string[],
  options: {
    cwd: string
    encoding: 'utf8'
    maxBuffer: number
    shell: false
    windowsHide: true
  },
): Promise<GitExecResult> {
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

async function validateRootPath(
  value: unknown,
  options: { requireDirectory: boolean },
): Promise<{ path: string; isDirectory: boolean }> {
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

function normalizeRepoRelativePath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Git path cannot be empty')
  if (value.includes('\0')) throw new Error('Git path contains invalid characters')
  if (path.isAbsolute(value)) throw new Error('Git path must be repository-relative')

  const normalized = path.normalize(value).replaceAll('\\', '/')
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Invalid git path: ${value}`)
  }
  return normalized
}

async function readUtf8IfFile(filePath: string): Promise<string> {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) return ''
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return ''
  }
}

function parsePorcelainStatus(stdout: string) {
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

function statusFromCode(code: string): GitFileChange['status'] | null {
  if (code === 'A') return 'added'
  if (code === 'M' || code === 'T') return 'modified'
  if (code === 'D') return 'deleted'
  if (code === 'R') return 'renamed'
  if (code === 'C') return 'copied'
  return null
}

function isConflict(stagedCode: string, unstagedCode: string): boolean {
  return (
    stagedCode === 'U' ||
    unstagedCode === 'U' ||
    stagedCode + unstagedCode === 'AA' ||
    stagedCode + unstagedCode === 'DD'
  )
}

function compareChanges(left: GitFileChange, right: GitFileChange): number {
  return left.path.localeCompare(right.path)
}

function emptyStatusSnapshot(): GitStatusSnapshot {
  return {
    repo: { ...emptyRepoInfo },
    staged: [],
    unstaged: [],
    untracked: [],
    conflicts: [],
  }
}

function allCommitChanges(snapshot: GitStatusSnapshot): GitFileChange[] {
  const byPath = new Map<string, GitFileChange>()
  for (const change of [...snapshot.staged, ...snapshot.unstaged, ...snapshot.untracked]) {
    byPath.set(change.path, change)
  }
  return [...byPath.values()]
}

function syntheticUnifiedDiff(
  filePath: string,
  originalContent: string,
  modifiedContent: string,
): string {
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
