import fs from 'node:fs/promises'
import path from 'node:path'

import type { GitOperationState } from '@/types/gitOperations'
import { GitOperationError } from '@electron/services/git/errors'
import { runGit } from '@electron/services/git/helpers'
import { commitIdentityArgs, readStatusSnapshot } from '@electron/services/git/repositoryState'
import type { GitStatusSnapshot } from '@electron/services/git/types'

const gitPath = async (root: string, name: string): Promise<string> => {
  return path.resolve(root, (await runGit(root, ['rev-parse', '--git-path', name])).stdout.trim())
}

const hasGitPath = async (root: string, name: string): Promise<boolean> => {
  return fs.access(await gitPath(root, name)).then(
    () => true,
    () => false,
  )
}

export const readOperationState = async (root: string): Promise<GitOperationState> => {
  const [merge, rebaseMerge, rebaseApply, revert, cherryPick, sequencer] = await Promise.all([
    hasGitPath(root, 'MERGE_HEAD'),
    hasGitPath(root, 'rebase-merge'),
    hasGitPath(root, 'rebase-apply'),
    hasGitPath(root, 'REVERT_HEAD'),
    hasGitPath(root, 'CHERRY_PICK_HEAD'),
    hasGitPath(root, 'sequencer'),
  ])
  if (rebaseMerge || rebaseApply) return { operation: 'rebase' }
  if (merge) return { operation: 'merge' }
  if (revert) return { operation: 'revert' }
  if (cherryPick) return { operation: 'cherry-pick' }
  if (sequencer) {
    const todo = await fs.readFile(await gitPath(root, 'sequencer/todo'), 'utf8').catch(() => '')
    if (todo.startsWith('revert ')) return { operation: 'revert' }
    if (todo.startsWith('pick ')) return { operation: 'cherry-pick' }
  }
  return { operation: null }
}

export const requireNoOperation = async (root: string): Promise<void> => {
  if ((await readOperationState(root)).operation) {
    throw new GitOperationError(
      'git_invalid_input',
      'Finish or abort the current Git operation first',
    )
  }
}

export const requireCleanWorktree = async (root: string): Promise<void> => {
  await requireNoOperation(root)
  const state = await readStatusSnapshot(root)
  if (state.conflicts.length)
    throw new GitOperationError('git_conflicts_present', 'Resolve Git conflicts first')
  if (state.staged.length || state.unstaged.length || state.untracked.length) {
    throw new GitOperationError(
      'git_dirty_worktree',
      'Commit or stash all changes before this operation',
    )
  }
}

export const continueSequence = async (root: string): Promise<GitStatusSnapshot> => {
  const { operation } = await readOperationState(root)
  if (!operation) throw new GitOperationError('git_invalid_input', 'No Git operation to continue')
  if ((await readStatusSnapshot(root)).conflicts.length) {
    throw new GitOperationError(
      'git_conflicts_present',
      'Stage all resolved conflicts before continuing',
    )
  }
  if (operation === 'rebase') {
    // External interactive rebases may contain shell exec steps; never execute them via the panel.
    const todo = await fs
      .readFile(await gitPath(root, 'rebase-merge/git-rebase-todo'), 'utf8')
      .catch(() => '')
    if (todo.split('\n').some((line) => /^(?:exec|x)\s/.test(line.trim()))) {
      throw new GitOperationError(
        'git_unsafe_configuration',
        'Rebase contains shell execution steps; continue it externally',
      )
    }
  }
  await runGit(root, [...(await commitIdentityArgs(root)), operation, '--continue'], {
    nonInteractive: true,
  })
  return readStatusSnapshot(root)
}

export const abortSequence = async (root: string): Promise<GitStatusSnapshot> => {
  const { operation } = await readOperationState(root)
  if (!operation) throw new GitOperationError('git_invalid_input', 'No Git operation to abort')
  await runGit(root, [operation, '--abort'])
  return readStatusSnapshot(root)
}
