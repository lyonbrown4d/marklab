import { noopLogger, type Logger } from '@electron/services/logger.js'
import { cloneRepository } from '@electron/services/git/clone.js'
import { GitOperationCoordinator } from '@electron/services/git/coordinator.js'
import { GitDiffReader } from '@electron/services/git/diff.js'
import { GitRemoteOperations } from '@electron/services/git/remoteOperations.js'
import {
  resolveCanonicalDirectory,
  resolveExactRepositoryRoot,
} from '@electron/services/git/repository.js'
import type {
  GitCloneResult,
  GitFileDiff,
  GitPushOptions,
  GitRemoteStatus,
  GitRepoInfo,
  GitStatusSnapshot,
} from '@electron/services/git/types.js'
import {
  allCommitChanges,
  compareChanges,
  emptyRepoInfo,
  emptyStatusSnapshot,
  parsePorcelainStatus,
  runGit,
} from '@electron/services/git/helpers.js'

export class GitService {
  private readonly coordinator = new GitOperationCoordinator()
  private readonly diffReader = new GitDiffReader()
  private readonly remoteOperations: GitRemoteOperations

  constructor(private readonly logger: Logger = noopLogger) {
    this.remoteOperations = new GitRemoteOperations(this.coordinator, logger)
  }

  async discover(rootPath: unknown): Promise<GitRepoInfo> {
    const root = await resolveExactRepositoryRoot(rootPath, { allowNotRepository: true })
    if (!root) return { ...emptyRepoInfo }
    return this.coordinator.query(root, 'repository-info', () => this.repoInfo(root))
  }

  async init(rootPath: unknown): Promise<GitRepoInfo> {
    const root = await resolveCanonicalDirectory(rootPath)
    return this.coordinator.mutate(root, () => this.initNow(root))
  }

  async status(rootPath: unknown): Promise<GitStatusSnapshot> {
    const root = await resolveExactRepositoryRoot(rootPath, { allowNotRepository: true })
    if (!root) return emptyStatusSnapshot()
    const snapshot = await this.coordinator.query(root, 'worktree-status', () =>
      this.readStatusSnapshot(root),
    )
    return this.cloneStatusSnapshot(snapshot)
  }

  async fileDiff(rootPath: unknown, filePath: unknown, section: unknown): Promise<GitFileDiff> {
    const root = await this.requireRepositoryRoot(rootPath)
    return this.coordinator.query(root, `file-diff:${String(section)}:${String(filePath)}`, () =>
      this.diffReader.fileDiff(root, filePath, section),
    )
  }

  async commitAll(rootPath: unknown, message: unknown): Promise<GitStatusSnapshot> {
    const commitMessage = typeof message === 'string' ? message.trim() : ''
    if (!commitMessage) throw new Error('Commit message cannot be empty')
    const root = await this.requireRepositoryRoot(rootPath)
    return this.coordinator.mutate(root, () => this.commitAllNow(root, commitMessage))
  }

  async remoteStatus(rootPath: unknown): Promise<GitRemoteStatus> {
    return this.remoteOperations.status(await this.requireRepositoryRoot(rootPath))
  }

  async setRemote(rootPath: unknown, name: unknown, url: unknown): Promise<GitRemoteStatus> {
    return this.remoteOperations.setRemote(await this.requireRepositoryRoot(rootPath), name, url)
  }

  async removeRemote(rootPath: unknown, name: unknown): Promise<GitRemoteStatus> {
    return this.remoteOperations.removeRemote(await this.requireRepositoryRoot(rootPath), name)
  }

  async fetch(rootPath: unknown, remoteName?: unknown): Promise<GitRemoteStatus> {
    return this.remoteOperations.fetch(await this.requireRepositoryRoot(rootPath), remoteName)
  }

  async pull(rootPath: unknown): Promise<GitRemoteStatus> {
    return this.remoteOperations.pull(await this.requireRepositoryRoot(rootPath))
  }

  async push(rootPath: unknown, options?: GitPushOptions): Promise<GitRemoteStatus> {
    return this.remoteOperations.push(await this.requireRepositoryRoot(rootPath), options)
  }

  clone(
    remoteUrl: unknown,
    targetPath: unknown,
    branch?: unknown,
    signal?: AbortSignal,
  ): Promise<GitCloneResult> {
    return cloneRepository(this.coordinator, this.logger, remoteUrl, targetPath, branch, signal)
  }

  private async initNow(root: string): Promise<GitRepoInfo> {
    const existing = await resolveExactRepositoryRoot(root, { allowNotRepository: true })
    if (existing) return this.repoInfo(existing)

    this.logger.info('git init started', { rootPath: root })
    const initWithMain = await runGit(root, ['init', '-b', 'main'], { allowFailure: true })
    if (initWithMain.stderr && initWithMain.stderr.includes('unknown switch')) {
      await runGit(root, ['init'])
    } else if (initWithMain.stderr) {
      throw new Error(`Failed to initialize git repository: ${initWithMain.stderr.trim()}`)
    }

    const initialized = await this.requireRepositoryRoot(root)
    const repo = await this.repoInfo(initialized)
    this.logger.info('git init finished', { rootPath: root })
    return repo
  }

  private async commitAllNow(root: string, commitMessage: string): Promise<GitStatusSnapshot> {
    const snapshot = await this.readStatusSnapshot(root)
    if (snapshot.conflicts.length > 0) throw new Error('Cannot commit while conflicts are present')
    if (allCommitChanges(snapshot).length === 0) throw new Error('No changes to commit')

    await runGit(root, ['add', '-A'])
    const identityArgs = await this.commitIdentityArgs(root)
    this.logger.info('git commit started', {
      changeCount: allCommitChanges(snapshot).length,
      rootPath: root,
    })
    await runGit(root, [...identityArgs, 'commit', '-m', commitMessage])
    this.logger.info('git commit finished', { rootPath: root })
    return this.readStatusSnapshot(root)
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

  private cloneStatusSnapshot(snapshot: GitStatusSnapshot): GitStatusSnapshot {
    return {
      repo: { ...snapshot.repo },
      staged: snapshot.staged.map((change) => ({ ...change })),
      unstaged: snapshot.unstaged.map((change) => ({ ...change })),
      untracked: snapshot.untracked.map((change) => ({ ...change })),
      conflicts: snapshot.conflicts.map((change) => ({ ...change })),
    }
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

  private async gitValue(root: string, args: string[]): Promise<string | null> {
    const result = await runGit(root, args, { allowFailure: true })
    const value = result.stdout.trim()
    return value || null
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

  private async requireRepositoryRoot(rootPath: unknown): Promise<string> {
    const root = await resolveExactRepositoryRoot(rootPath, { allowNotRepository: false })
    if (!root) throw new Error('Workspace root is not a Git repository')
    return root
  }
}
