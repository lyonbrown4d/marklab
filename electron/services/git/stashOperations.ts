import { GitOperationError } from '@electron/services/git/errors'
import { runGit } from '@electron/services/git/helpers'
import { readStashes } from '@electron/services/git/history'
import { validateStashRef } from '@electron/services/git/operationValidation'
import { requireNoOperation } from '@electron/services/git/sequencer'

const requireStash = async (
  root: string,
  ref: unknown,
  expectedHash?: unknown,
): Promise<{ ref: string; hash: string }> => {
  const safeRef = validateStashRef(ref)
  if (
    expectedHash !== undefined &&
    (typeof expectedHash !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(expectedHash))
  ) {
    throw new GitOperationError('git_invalid_input', 'A full stash commit hash is required')
  }
  // Bypass query caching: an external Git process may have shifted stash indices.
  const entry = (await readStashes(root)).find((stash) => stash.ref === safeRef)
  if (!entry)
    throw new GitOperationError(
      'git_invalid_input',
      'Stash entry does not exist; refresh the stash list',
    )
  if (typeof expectedHash === 'string' && entry.hash !== expectedHash.toLowerCase()) {
    throw new GitOperationError(
      'git_invalid_input',
      'Stash entry changed; refresh the stash list and try again',
    )
  }
  return entry
}

export const saveStash = async (root: string, message?: unknown): Promise<void> => {
  await requireNoOperation(root)
  if (
    message !== undefined &&
    (typeof message !== 'string' || message.length > 10_000 || message.includes('\0'))
  ) {
    throw new GitOperationError('git_invalid_input', 'Invalid stash message')
  }
  await runGit(root, [
    'stash',
    'push',
    '--include-untracked',
    ...(message ? ['-m', String(message)] : []),
  ])
}

export const applyStash = async (
  root: string,
  ref: unknown,
  expectedHash?: unknown,
): Promise<void> => {
  await requireNoOperation(root)
  const entry = await requireStash(root, ref, expectedHash)
  // Use the verified immutable object when guarded, even if the reflog shifts again.
  await runGit(root, ['stash', 'apply', expectedHash === undefined ? entry.ref : entry.hash])
}

export const dropStash = async (
  root: string,
  ref: unknown,
  expectedHash?: unknown,
): Promise<void> => {
  await requireNoOperation(root)
  const entry = await requireStash(root, ref, expectedHash)
  await runGit(root, ['stash', 'drop', entry.ref])
}
