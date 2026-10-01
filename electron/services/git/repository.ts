import fs from 'node:fs/promises'
import path from 'node:path'

import { GitOperationError } from '@electron/services/git/errors.js'
import { runGit, validateRootPath } from '@electron/services/git/helpers.js'

const UNSAFE_CONFIG_PATTERNS = [
  /^alias\./,
  /^core\.(askpass|editor|fsmonitor|gitproxy|hookspath|sshcommand)$/,
  /^credential(?:\..+)?\.helper$/,
  /^diff\..*\.(command|textconv)$/,
  /^diff\.external$/,
  /^difftool\..*\.cmd$/,
  /^filter\..*\.(clean|process|smudge)$/,
  /^gpg\.program$/,
  /^include\.path$/,
  /^includeif\./,
  /^merge\..*\.driver$/,
  /^mergetool\..*\.(cmd|path)$/,
  /^protocol\..*\.allow$/,
  /^remote\..*\.(receivepack|uploadpack|vcs)$/,
  /^sequence\.editor$/,
  /^submodule\..*\.update$/,
  /^url\..*\.(insteadof|pushinsteadof)$/,
]

const canonicalKey = (value: string): string => {
  const normalized = value.replaceAll('\\', '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export const assertSafeRepositoryConfig = async (root: string): Promise<void> => {
  const result = await runGit(root, ['config', '--local', '--name-only', '-z', '--list'], {
    allowFailure: true,
  })
  const unsafe = result.stdout
    .split('\0')
    .map((name) => name.trim().toLowerCase())
    .find((name) => UNSAFE_CONFIG_PATTERNS.some((pattern) => pattern.test(name)))
  if (unsafe) {
    throw new GitOperationError(
      'git_unsafe_configuration',
      `Repository contains unsafe Git configuration: ${unsafe}`,
    )
  }
}

export const resolveExactRepositoryRoot = async (
  rootPath: unknown,
  options: { allowNotRepository: boolean },
): Promise<string | null> => {
  const requestedCanonical = await resolveCanonicalDirectory(rootPath)
  const result = await runGit(requestedCanonical, ['rev-parse', '--show-toplevel'], {
    allowFailure: true,
  })
  const discovered = result.stdout.trim()
  if (!discovered) {
    if (options.allowNotRepository) return null
    throw new GitOperationError('git_not_repository', 'Workspace root is not a Git repository')
  }
  const repositoryCanonical = await fs.realpath(path.resolve(discovered))
  if (canonicalKey(repositoryCanonical) !== canonicalKey(requestedCanonical)) {
    if (options.allowNotRepository) return null
    throw new GitOperationError(
      'git_workspace_boundary',
      'Git repository top-level must equal the selected workspace root',
    )
  }
  await assertSafeRepositoryConfig(repositoryCanonical)
  return repositoryCanonical
}

export const resolveCanonicalDirectory = async (rootPath: unknown): Promise<string> => {
  const requested = await validateRootPath(rootPath, { requireDirectory: true })
  return fs.realpath(requested.path)
}
