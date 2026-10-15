import { randomUUID } from 'node:crypto'

import type { GitHistoryOptions, GitResetMode } from '@/types/gitOperations'
import { GitOperationCoordinator } from '@electron/services/git/coordinator'
import { GitOperationError } from '@electron/services/git/errors'
import { runGit } from '@electron/services/git/helpers'
import {
  readBranches,
  readCommitDiff,
  readCommitFiles,
  readHistory,
  readStashes,
} from '@electron/services/git/history'
import {
  resolveBranchCommit,
  resolveCommit,
  resolveStartPoint,
  validateCommitMessage,
  validateLocalBranch,
} from '@electron/services/git/operationValidation'
import { removeUntrackedFile, validateSelectedPaths } from '@electron/services/git/pathSafety'
import {
  commitIdentityArgs,
  gitValue,
  readStatusSnapshot,
} from '@electron/services/git/repositoryState'
import {
  abortSequence,
  continueSequence,
  readOperationState,
  requireCleanWorktree,
  requireNoOperation,
} from '@electron/services/git/sequencer'
import { applyStash, dropStash, saveStash } from '@electron/services/git/stashOperations'
import type { GitStatusSnapshot } from '@electron/services/git/types'

export class GitLocalOperations {
  constructor(private readonly coordinator: GitOperationCoordinator) {}

  stage(root: string, paths: unknown): Promise<GitStatusSnapshot> {
    return this.mutate(root, async () => {
      const selected = await validateSelectedPaths(root, paths, await readStatusSnapshot(root))
      await runGit(root, ['--literal-pathspecs', 'add', '-A', '--', ...selected])
    })
  }

  unstage(root: string, paths: unknown): Promise<GitStatusSnapshot> {
    return this.mutate(root, async () => {
      const selected = await validateSelectedPaths(root, paths, await readStatusSnapshot(root))
      if (await gitValue(root, ['rev-parse', '--verify', 'HEAD'])) {
        await runGit(root, [
          '--literal-pathspecs',
          'restore',
          '--source=HEAD',
          '--staged',
          '--',
          ...selected,
        ])
      } else {
        await runGit(root, [
          '--literal-pathspecs',
          'rm',
          '--cached',
          '-f',
          '--ignore-unmatch',
          '--',
          ...selected,
        ])
      }
    })
  }

  discard(root: string, paths: unknown): Promise<GitStatusSnapshot> {
    return this.mutate(root, async () => {
      const snapshot = await readStatusSnapshot(root)
      if (snapshot.conflicts.length)
        throw new GitOperationError(
          'git_conflicts_present',
          'Resolve conflicts before discarding files',
        )
      const selected = await validateSelectedPaths(root, paths, snapshot)
      const untracked = new Set(snapshot.untracked.map((file) => file.path))
      const indexFiles = new Set(
        (await runGit(root, ['ls-files', '-z'])).stdout.split('\0').filter(Boolean),
      )
      const tracked = selected.filter((file) => indexFiles.has(file))
      if (tracked.length)
        await runGit(root, ['--literal-pathspecs', 'restore', '--worktree', '--', ...tracked])
      // A staged deletion has no index blob; discard never restores it from HEAD.
      for (const file of selected.filter((file) => untracked.has(file))) {
        await removeUntrackedFile(root, file)
      }
    })
  }

  commitStaged(root: string, message: unknown): Promise<GitStatusSnapshot> {
    return this.mutate(root, async () => {
      const text = validateCommitMessage(message)
      const snapshot = await readStatusSnapshot(root)
      const state = await readOperationState(root)
      if (state.operation && state.operation !== 'merge')
        throw new GitOperationError(
          'git_invalid_input',
          'Use Continue for the current Git operation',
        )
      if (snapshot.conflicts.length)
        throw new GitOperationError(
          'git_conflicts_present',
          'Resolve and stage conflicts before committing',
        )
      if (!snapshot.staged.length && state.operation !== 'merge')
        throw new GitOperationError('git_invalid_input', 'No staged changes to commit')
      await runGit(root, [...(await commitIdentityArgs(root)), 'commit', '-m', text])
    })
  }

  history(root: string, options?: GitHistoryOptions) {
    return this.coordinator.query(root, `history:${JSON.stringify(options ?? {})}`, () =>
      readHistory(root, options),
    )
  }

  branches(root: string) {
    return this.coordinator.query(root, 'branches', () => readBranches(root))
  }

  createBranch(root: string, name: unknown, startPoint?: unknown): Promise<GitStatusSnapshot> {
    return this.mutate(root, async () => {
      await requireCleanWorktree(root)
      const branch = await validateLocalBranch(root, name)
      const start = startPoint === undefined ? [] : [await resolveStartPoint(root, startPoint)]
      await runGit(root, ['branch', '--', branch, ...start])
    })
  }

  switchBranch(root: string, name: unknown): Promise<GitStatusSnapshot> {
    return this.mutate(root, async () => {
      await requireCleanWorktree(root)
      const branch = await validateLocalBranch(root, name)
      await runGit(root, ['show-ref', '--verify', `refs/heads/${branch}`])
      await runGit(root, ['switch', '--no-guess', '--', branch])
    })
  }

  deleteBranch(root: string, name: unknown, force = false): Promise<GitStatusSnapshot> {
    return this.mutate(root, async () => {
      await requireNoOperation(root)
      if (typeof force !== 'boolean')
        throw new GitOperationError('git_invalid_input', 'Force must be a boolean')
      const branch = await validateLocalBranch(root, name)
      // Git itself refuses current and linked-worktree branches, including with -D.
      await runGit(root, ['branch', force ? '-D' : '-d', '--', branch])
    })
  }

  merge(root: string, name: unknown): Promise<GitStatusSnapshot> {
    return this.mutate(root, async () => {
      await requireCleanWorktree(root)
      const commit = await resolveBranchCommit(root, name)
      await runGit(root, [
        ...(await commitIdentityArgs(root)),
        'merge',
        '--no-edit',
        '--no-autostash',
        commit,
      ])
    })
  }

  rebase(root: string, name: unknown): Promise<GitStatusSnapshot> {
    return this.mutate(root, async () => {
      await requireCleanWorktree(root)
      const commit = await resolveBranchCommit(root, name)
      await runGit(
        root,
        [
          ...(await commitIdentityArgs(root)),
          '-c',
          'rebase.autoSquash=false',
          '-c',
          'rebase.updateRefs=false',
          'rebase',
          '--no-autostash',
          '--no-gpg-sign',
          commit,
        ],
        { nonInteractive: true },
      )
    })
  }

  cherryPick(root: string, commit: unknown): Promise<GitStatusSnapshot> {
    return this.mutate(root, async () => {
      await requireCleanWorktree(root)
      await runGit(root, [
        ...(await commitIdentityArgs(root)),
        'cherry-pick',
        '--no-gpg-sign',
        await resolveCommit(root, commit),
      ])
    })
  }

  revert(root: string, commit: unknown, mainline?: unknown): Promise<GitStatusSnapshot> {
    return this.mutate(root, async () => {
      await requireCleanWorktree(root)
      const hash = await resolveCommit(root, commit)
      const parentCount =
        (await runGit(root, ['rev-list', '--parents', '-n', '1', hash])).stdout.trim().split(' ')
          .length - 1
      if (
        mainline !== undefined &&
        (typeof mainline !== 'number' ||
          !Number.isInteger(mainline) ||
          mainline < 1 ||
          mainline > parentCount)
      ) {
        throw new GitOperationError('git_invalid_input', 'Invalid merge mainline parent')
      }
      if (parentCount > 1 && mainline === undefined)
        throw new GitOperationError(
          'git_invalid_input',
          'Choose the mainline parent to revert a merge',
        )
      await runGit(root, [
        ...(await commitIdentityArgs(root)),
        'revert',
        '--no-edit',
        '--no-gpg-sign',
        ...(mainline === undefined ? [] : ['--mainline', String(mainline)]),
        hash,
      ])
    })
  }

  reset(root: string, commit: unknown, mode: GitResetMode) {
    return this.coordinator.mutate(root, async () => {
      if (!['soft', 'mixed', 'hard'].includes(mode))
        throw new GitOperationError('git_invalid_input', 'Invalid reset mode')
      await requireCleanWorktree(root)
      const hash = await resolveCommit(root, commit)
      const head = await gitValue(root, ['rev-parse', '--verify', 'HEAD'])
      if (!head)
        throw new GitOperationError('git_invalid_input', 'Cannot reset an unborn repository')
      const backupBranch = `marklab-backup-${randomUUID()}`
      await runGit(root, ['branch', '--', backupBranch, head])
      await runGit(root, ['reset', `--${mode}`, hash])
      return { status: await readStatusSnapshot(root), backupBranch }
    })
  }

  stashList(root: string) {
    return this.coordinator.query(root, 'stashes', () => readStashes(root))
  }

  stashSave(root: string, message?: unknown): Promise<GitStatusSnapshot> {
    return this.mutate(root, () => saveStash(root, message))
  }

  stashApply(root: string, ref: unknown, expectedHash?: unknown): Promise<GitStatusSnapshot> {
    return this.mutate(root, () => applyStash(root, ref, expectedHash))
  }

  stashDrop(root: string, ref: unknown, expectedHash?: unknown): Promise<GitStatusSnapshot> {
    return this.mutate(root, () => dropStash(root, ref, expectedHash))
  }

  operationState(root: string) {
    return this.coordinator.query(root, 'operation-state', () => readOperationState(root))
  }

  continueOperation(root: string) {
    return this.coordinator.mutate(root, () => continueSequence(root))
  }

  abortOperation(root: string) {
    return this.coordinator.mutate(root, () => abortSequence(root))
  }

  commitFiles(root: string, commit: unknown) {
    return this.coordinator.query(root, `commit-files:${String(commit)}`, () =>
      readCommitFiles(root, commit),
    )
  }

  commitDiff(root: string, commit: unknown, file: unknown, oldFile?: unknown) {
    return this.coordinator.query(
      root,
      `commit-diff:${JSON.stringify([commit, file, oldFile])}`,
      () => readCommitDiff(root, commit, file, oldFile),
    )
  }

  private mutate(root: string, action: () => Promise<void>): Promise<GitStatusSnapshot> {
    return this.coordinator.mutate(root, async () => {
      await action()
      return readStatusSnapshot(root)
    })
  }
}
