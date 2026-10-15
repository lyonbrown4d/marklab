import type { GitHistoryOptions, GitResetMode } from '@/types/gitOperations'
import type { GitConflictSnapshot, GitConflictSaveResult } from '@/types/gitConflicts'
import { noopLogger, type Logger } from '@electron/services/logger'
import { cloneRepository } from '@electron/services/git/clone'
import { GitOperationCoordinator } from '@electron/services/git/coordinator'
import { GitDiffReader } from '@electron/services/git/diff'
import { readConflictDetails } from '@electron/services/git/conflictSnapshot'
import { saveConflictResult } from '@electron/services/git/conflictSave'
import { GitLocalOperations } from '@electron/services/git/localOperations'
import {
  commitIdentityArgs,
  readRepoInfo,
  readStatusSnapshot,
} from '@electron/services/git/repositoryState'
import { GitRemoteOperations } from '@electron/services/git/remoteOperations'
import {
  resolveCanonicalDirectory,
  resolveExactRepositoryRoot,
} from '@electron/services/git/repository'
import type {
  GitCloneResult,
  GitFileDiff,
  GitPushOptions,
  GitRemoteStatus,
  GitRepoInfo,
  GitStatusSnapshot,
} from '@electron/services/git/types'
import {
  allCommitChanges,
  emptyRepoInfo,
  emptyStatusSnapshot,
  runGit,
} from '@electron/services/git/helpers'

export class GitService {
  private readonly coordinator = new GitOperationCoordinator()
  private readonly localOperations = new GitLocalOperations(this.coordinator)
  private readonly diffReader = new GitDiffReader()
  private readonly remoteOperations: GitRemoteOperations

  constructor(private readonly logger: Logger = noopLogger) {
    this.remoteOperations = new GitRemoteOperations(this.coordinator, logger)
  }

  async discover(rootPath: unknown): Promise<GitRepoInfo> {
    const root = await resolveExactRepositoryRoot(rootPath, { allowNotRepository: true })
    if (!root) return { ...emptyRepoInfo }
    return this.coordinator.query(root, 'repository-info', () => readRepoInfo(root))
  }

  async init(rootPath: unknown): Promise<GitRepoInfo> {
    const root = await resolveCanonicalDirectory(rootPath)
    return this.coordinator.mutate(root, () => this.initNow(root))
  }

  async status(rootPath: unknown): Promise<GitStatusSnapshot> {
    const root = await resolveExactRepositoryRoot(rootPath, { allowNotRepository: true })
    if (!root) return emptyStatusSnapshot()
    const snapshot = await this.coordinator.query(root, 'worktree-status', () =>
      readStatusSnapshot(root),
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

  async conflict(rootPath: unknown, filePath: unknown): Promise<GitConflictSnapshot> {
    const root = await this.requireRepositoryRoot(rootPath)
    return this.coordinator.query(
      root,
      `conflict:${String(filePath)}`,
      async () => (await readConflictDetails(root, filePath)).snapshot,
    )
  }

  async saveConflict(rootPath: unknown, request: unknown): Promise<GitConflictSaveResult> {
    const root = await this.requireRepositoryRoot(rootPath)
    return this.coordinator.mutate(root, () => saveConflictResult(root, request))
  }

  async stage(rootPath: unknown, paths: unknown) {
    return this.localOperations.stage(await this.requireRepositoryRoot(rootPath), paths)
  }

  async unstage(rootPath: unknown, paths: unknown) {
    return this.localOperations.unstage(await this.requireRepositoryRoot(rootPath), paths)
  }

  async discard(rootPath: unknown, paths: unknown) {
    return this.localOperations.discard(await this.requireRepositoryRoot(rootPath), paths)
  }

  async commitStaged(rootPath: unknown, message: unknown) {
    return this.localOperations.commitStaged(await this.requireRepositoryRoot(rootPath), message)
  }

  async history(rootPath: unknown, options?: GitHistoryOptions) {
    return this.localOperations.history(await this.requireRepositoryRoot(rootPath), options)
  }

  async branches(rootPath: unknown) {
    return this.localOperations.branches(await this.requireRepositoryRoot(rootPath))
  }

  async createBranch(rootPath: unknown, name: unknown, startPoint?: unknown) {
    return this.localOperations.createBranch(
      await this.requireRepositoryRoot(rootPath),
      name,
      startPoint,
    )
  }

  async switchBranch(rootPath: unknown, name: unknown) {
    return this.localOperations.switchBranch(await this.requireRepositoryRoot(rootPath), name)
  }

  async deleteBranch(rootPath: unknown, name: unknown, force = false) {
    return this.localOperations.deleteBranch(
      await this.requireRepositoryRoot(rootPath),
      name,
      force,
    )
  }

  async merge(rootPath: unknown, name: unknown) {
    return this.localOperations.merge(await this.requireRepositoryRoot(rootPath), name)
  }

  async rebase(rootPath: unknown, name: unknown) {
    return this.localOperations.rebase(await this.requireRepositoryRoot(rootPath), name)
  }

  async cherryPick(rootPath: unknown, commit: unknown) {
    return this.localOperations.cherryPick(await this.requireRepositoryRoot(rootPath), commit)
  }

  async revert(rootPath: unknown, commit: unknown, mainline?: unknown) {
    return this.localOperations.revert(await this.requireRepositoryRoot(rootPath), commit, mainline)
  }

  async reset(rootPath: unknown, commit: unknown, mode: GitResetMode) {
    return this.localOperations.reset(await this.requireRepositoryRoot(rootPath), commit, mode)
  }

  async stashList(rootPath: unknown) {
    return this.localOperations.stashList(await this.requireRepositoryRoot(rootPath))
  }

  async stashSave(rootPath: unknown, message?: unknown) {
    return this.localOperations.stashSave(await this.requireRepositoryRoot(rootPath), message)
  }

  async stashApply(rootPath: unknown, ref: unknown, expectedHash?: unknown) {
    return this.localOperations.stashApply(
      await this.requireRepositoryRoot(rootPath),
      ref,
      expectedHash,
    )
  }

  async stashDrop(rootPath: unknown, ref: unknown, expectedHash?: unknown) {
    return this.localOperations.stashDrop(
      await this.requireRepositoryRoot(rootPath),
      ref,
      expectedHash,
    )
  }

  async operationState(rootPath: unknown) {
    return this.localOperations.operationState(await this.requireRepositoryRoot(rootPath))
  }

  async continueOperation(rootPath: unknown) {
    return this.localOperations.continueOperation(await this.requireRepositoryRoot(rootPath))
  }

  async abortOperation(rootPath: unknown) {
    return this.localOperations.abortOperation(await this.requireRepositoryRoot(rootPath))
  }

  async commitFiles(rootPath: unknown, commit: unknown) {
    return this.localOperations.commitFiles(await this.requireRepositoryRoot(rootPath), commit)
  }

  async commitDiff(rootPath: unknown, commit: unknown, file: unknown, oldFile?: unknown) {
    return this.localOperations.commitDiff(
      await this.requireRepositoryRoot(rootPath),
      commit,
      file,
      oldFile,
    )
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
    if (existing) return readRepoInfo(existing)

    this.logger.info('git init started', { rootPath: root })
    const initWithMain = await runGit(root, ['init', '-b', 'main'], { allowFailure: true })
    if (initWithMain.stderr && initWithMain.stderr.includes('unknown switch')) {
      await runGit(root, ['init'])
    } else if (initWithMain.stderr) {
      throw new Error(`Failed to initialize git repository: ${initWithMain.stderr.trim()}`)
    }

    const initialized = await this.requireRepositoryRoot(root)
    const repo = await readRepoInfo(initialized)
    this.logger.info('git init finished', { rootPath: root })
    return repo
  }

  private async commitAllNow(root: string, commitMessage: string): Promise<GitStatusSnapshot> {
    const snapshot = await readStatusSnapshot(root)
    if (snapshot.conflicts.length > 0) throw new Error('Cannot commit while conflicts are present')
    if (allCommitChanges(snapshot).length === 0) throw new Error('No changes to commit')

    await runGit(root, ['add', '-A'])
    const identityArgs = await commitIdentityArgs(root)
    this.logger.info('git commit started', {
      changeCount: allCommitChanges(snapshot).length,
      rootPath: root,
    })
    await runGit(root, [...identityArgs, 'commit', '-m', commitMessage])
    this.logger.info('git commit finished', { rootPath: root })
    return readStatusSnapshot(root)
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

  private async requireRepositoryRoot(rootPath: unknown): Promise<string> {
    const root = await resolveExactRepositoryRoot(rootPath, { allowNotRepository: false })
    if (!root) throw new Error('Workspace root is not a Git repository')
    return root
  }
}
