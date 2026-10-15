import { simpleGit } from 'simple-git'

import { GitOperationError, redactGitCredentials } from '@electron/services/git/errors'
import { buildSafeGitArgs, SAFE_SIMPLE_GIT_OPTIONS } from '@electron/services/git/gitPolicy'

type GitExecResult = {
  stdout: string
  stderr: string
}

type GitExecOptions = {
  allowFailure?: boolean
  nonInteractive?: boolean
  input?: Buffer | string
  signal?: AbortSignal
}

export const runGit = async (
  cwd: string,
  args: string[],
  options: GitExecOptions = {},
): Promise<GitExecResult> => {
  const git = createGit(cwd, options)
  try {
    // Permit only our fixed editor override, scoped to noninteractive commands.
    const command = options.nonInteractive ? ['-c', 'core.editor=true', ...args] : args
    const stdout = await git.raw(await buildSafeGitArgs(command))
    return { stdout: outputToString(stdout), stderr: '' }
  } catch (error) {
    return handleGitFailure(cwd, args, options, error)
  }
}

const createGit = (cwd: string, options: GitExecOptions = {}, config: string[] = []) =>
  simpleGit({
    baseDir: cwd,
    binary: 'git',
    abort: options.signal,
    ...SAFE_SIMPLE_GIT_OPTIONS,
    // simple-git's default only rejects nonzero exits when stderr is populated.
    // Merge/stash conflicts can write exclusively to stdout and must still fail.
    errors: (error, result) => {
      if (error) return error
      if (result.exitCode === 0) return undefined
      const output = Buffer.concat([...result.stdOut, ...result.stdErr])
      return output.length ? output : new Error(`Git exited with status ${result.exitCode}`)
    },
    ...(options.nonInteractive
      ? {
          unsafe: { ...SAFE_SIMPLE_GIT_OPTIONS.unsafe, allowUnsafeEditor: true },
        }
      : {}),
    config,
    input: options.input === undefined ? undefined : () => options.input,
  })

const handleGitFailure = (
  cwd: string,
  args: string[],
  options: GitExecOptions,
  error: unknown,
): GitExecResult => {
  const failure = error as Error & {
    stdout?: string | Buffer
    stderr?: string | Buffer
    message?: string
  }
  if (options.allowFailure) {
    return {
      stdout: outputToString(failure.stdout),
      stderr: redactGitCredentials(outputToString(failure.stderr, failure.message)),
    }
  }
  const message = redactGitCredentials(outputToString(failure.stderr, failure.message))
  const command = redactGitCredentials(args.join(' '))
  throw new GitOperationError(
    'git_command_failed',
    `Git command failed: git ${command} (cwd: ${cwd})${message ? ` - ${message.trim()}` : ''}`,
    error,
  )
}

const outputToString = (output: string | Buffer | undefined, fallback = ''): string => {
  if (typeof output === 'string') return output
  return output ? output.toString('utf8') : fallback
}

export const runGitBlobBuffer = async (root: string, hash: string): Promise<Buffer> => {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(hash))
    throw new GitOperationError('git_invalid_input', 'Invalid Git blob hash')
  const configArgs = await buildSafeGitArgs([])
  const config = configArgs.filter((_, index) => index % 2 === 1)
  try {
    const result: unknown = await createGit(root, {}, config).binaryCatFile(['blob', hash])
    if (!Buffer.isBuffer(result)) throw new Error('Git did not return blob bytes')
    return result
  } catch (error) {
    handleGitFailure(root, ['cat-file', 'blob', hash], {}, error)
    throw error
  }
}
