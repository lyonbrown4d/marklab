import path from 'node:path'

import type { Logger } from '@electron/services/logger.js'
import { prepareCloneDestination } from '@electron/services/git/cloneTarget.js'
import { GitOperationCoordinator } from '@electron/services/git/coordinator.js'
import { GitOperationError } from '@electron/services/git/errors.js'
import { runGit } from '@electron/services/git/helpers.js'
import { assertSafeRepositoryConfig } from '@electron/services/git/repository.js'
import type { GitCloneResult, GitRepoInfo } from '@electron/services/git/types.js'
import { validateBranchName, validateRemoteUrl } from '@electron/services/git/validation.js'

const cloneRepoInfo = async (root: string): Promise<GitRepoInfo> => {
  const value = async (args: string[]) =>
    (await runGit(root, args, { allowFailure: true })).stdout.trim() || null
  const [workdir, gitDir, branch, head] = await Promise.all([
    value(['rev-parse', '--show-toplevel']),
    value(['rev-parse', '--absolute-git-dir']),
    value(['symbolic-ref', '--short', '-q', 'HEAD']),
    value(['rev-parse', '--verify', 'HEAD']),
  ])
  return { is_repository: true, workdir, git_dir: gitDir, branch, head }
}

export const cloneRepository = async (
  coordinator: GitOperationCoordinator,
  logger: Logger,
  remoteUrl: unknown,
  targetPath: unknown,
  branchValue?: unknown,
  signal?: AbortSignal,
): Promise<GitCloneResult> => {
  const url = validateRemoteUrl(remoteUrl)
  const branch = branchValue === undefined ? null : validateBranchName(branchValue)
  if (signal?.aborted) {
    throw new GitOperationError('git_operation_cancelled', 'Git clone was cancelled')
  }
  const destination = await prepareCloneDestination(targetPath)

  return coordinator.mutate(destination.targetPath, async () => {
    const args = [
      'clone',
      ...(branch ? ['--branch', branch, '--single-branch'] : []),
      '--',
      url,
      destination.stagingPath,
    ]
    logger.info('git clone started', { branch, targetPath: destination.targetPath })
    try {
      await runGit(path.dirname(destination.stagingPath), args, { signal })
      await assertSafeRepositoryConfig(destination.stagingPath)
      if (signal?.aborted) {
        throw new GitOperationError('git_operation_cancelled', 'Git clone was cancelled')
      }
      await destination.publish()
    } catch (error) {
      await destination.cleanup()
      if (signal?.aborted) {
        throw new GitOperationError('git_operation_cancelled', 'Git clone was cancelled', error)
      }
      throw error
    }
    logger.info('git clone finished', { targetPath: destination.targetPath })
    return { cancelled: false, repository: await cloneRepoInfo(destination.targetPath) }
  })
}
