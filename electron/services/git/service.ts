import path from 'node:path'

import { noopLogger, type Logger } from '@electron/services/logger.js'
import type { GitFileDiff, GitRepoInfo, GitStatusSnapshot } from '@electron/services/git/types.js'
import {
  allCommitChanges,
  compareChanges,
  emptyRepoInfo,
  emptyStatusSnapshot,
  normalizeRepoRelativePath,
  parsePorcelainStatus,
  readUtf8IfFile,
  runGit,
  syntheticUnifiedDiff,
  validateRootPath,
} from '@electron/services/git/helpers.js'

type CachedStatusSnapshot = {
  snapshot: GitStatusSnapshot
  updatedAt: number
}

const STATUS_CACHE_TTL_MS = 700

export class GitService {
  private readonly statusCache = new Map<string, CachedStatusSnapshot>()
  private readonly statusInFlight = new Map<string, Promise<GitStatusSnapshot>>()

  constructor(private readonly logger: Logger = noopLogger) {}

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

    this.logger.info('git init started', { rootPath: root.path })
    const initWithMain = await runGit(root.path, ['init', '-b', 'main'], { allowFailure: true })
    if (initWithMain.stderr && initWithMain.stderr.includes('unknown switch')) {
      await runGit(root.path, ['init'])
    } else if (initWithMain.stderr && !(await this.isRepository(root.path))) {
      throw new Error(`Failed to initialize git repository: ${initWithMain.stderr.trim()}`)
    }

    const repo = await this.repoInfo(root.path)
    this.logger.info('git init finished', { rootPath: root.path })
    this.invalidateStatusCache(root.path)
    return repo
  }

  async status(rootPath: unknown): Promise<GitStatusSnapshot> {
    const root = await validateRootPath(rootPath, { requireDirectory: false })
    if (!root.isDirectory || !(await this.isRepository(root.path))) {
      return emptyStatusSnapshot()
    }

    return this.statusForRepository(root.path)
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

    this.invalidateStatusCache(root.path)
    const snapshot = await this.readStatusSnapshot(root.path)
    if (snapshot.conflicts.length > 0) throw new Error('Cannot commit while conflicts are present')
    if (allCommitChanges(snapshot).length === 0) throw new Error('No changes to commit')

    await runGit(root.path, ['add', '-A'])
    this.invalidateStatusCache(root.path)
    const identityArgs = await this.commitIdentityArgs(root.path)
    this.logger.info('git commit started', {
      changeCount: allCommitChanges(snapshot).length,
      rootPath: root.path,
    })
    await runGit(root.path, [...identityArgs, 'commit', '-m', commitMessage])
    this.invalidateStatusCache(root.path)
    this.logger.info('git commit finished', { rootPath: root.path })
    return this.statusForRepository(root.path)
  }

  private statusForRepository(root: string): Promise<GitStatusSnapshot> {
    const cached = this.statusCache.get(root)
    if (cached && Date.now() - cached.updatedAt < STATUS_CACHE_TTL_MS) {
      return Promise.resolve(this.cloneStatusSnapshot(cached.snapshot))
    }

    const inFlight = this.statusInFlight.get(root)
    if (inFlight) return inFlight.then((snapshot) => this.cloneStatusSnapshot(snapshot))

    const request = this.readStatusSnapshot(root)
      .then((snapshot) => {
        this.statusCache.set(root, {
          snapshot: this.cloneStatusSnapshot(snapshot),
          updatedAt: Date.now(),
        })
        return snapshot
      })
      .finally(() => {
        this.statusInFlight.delete(root)
      })

    this.statusInFlight.set(root, request)
    return request.then((snapshot) => this.cloneStatusSnapshot(snapshot))
  }

  private async readStatusSnapshot(root: string): Promise<GitStatusSnapshot> {
    const repo = await this.repoInfo(root)
    const { stdout } = await runGit(root, [
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

  private invalidateStatusCache(root?: string): void {
    if (!root) {
      this.statusCache.clear()
      this.statusInFlight.clear()
      return
    }
    this.statusCache.delete(root)
    this.statusInFlight.delete(root)
  }

  private cloneStatusSnapshot(snapshot: GitStatusSnapshot): GitStatusSnapshot {
    return {
      repo: { ...snapshot.repo },
      staged: snapshot.staged.map((change) => ({ ...change })),
      unstaged: snapshot.unstaged.map((change) => ({ ...change })),
      untracked: snapshot.untracked.map((change) => ({ ...change })),
      conflicts: snapshot.conflicts.map((change) => ({ ...change })),
    }
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
    if (!name) args.push('-c', 'user.name=marklab')
    if (!email) args.push('-c', 'user.email=marklab@local')
    return args
  }
}
