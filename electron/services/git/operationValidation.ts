import { GitOperationError } from '@electron/services/git/errors'
import { runGit } from '@electron/services/git/helpers'
import { validateBranchName } from '@electron/services/git/validation'

export const validateLocalBranch = async (root: string, value: unknown): Promise<string> => {
  const name = validateBranchName(value)
  await runGit(root, ['check-ref-format', `refs/heads/${name}`])
  return name
}

export const resolveCommit = async (root: string, value: unknown): Promise<string> => {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)) {
    throw new GitOperationError('git_invalid_input', 'A full Git commit hash is required')
  }
  return (await runGit(root, ['rev-parse', '--verify', `${value}^{commit}`])).stdout.trim()
}

export const resolveBranchCommit = async (root: string, value: unknown): Promise<string> => {
  const name = await validateLocalBranch(root, value)
  const local = await runGit(root, ['rev-parse', '--verify', `refs/heads/${name}^{commit}`], {
    allowFailure: true,
  })
  if (!local.stderr && local.stdout.trim()) return local.stdout.trim()
  return (
    await runGit(root, ['rev-parse', '--verify', `refs/remotes/${name}^{commit}`])
  ).stdout.trim()
}

export const resolveStartPoint = async (root: string, value: unknown): Promise<string> => {
  if (typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)) {
    return resolveCommit(root, value)
  }
  return resolveBranchCommit(root, value)
}

export const validateCommitMessage = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 10_000 || value.includes('\0')) {
    throw new GitOperationError(
      'git_invalid_input',
      'Commit message must contain 1–10000 characters',
    )
  }
  return value.trim()
}

export const validateStashRef = (value: unknown): string => {
  if (typeof value !== 'string' || !/^stash@\{\d+\}$/.test(value)) {
    throw new GitOperationError('git_invalid_input', 'Invalid stash reference')
  }
  return value
}
