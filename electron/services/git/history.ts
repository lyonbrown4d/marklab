import type {
  GitBranchSummary,
  GitCommitFile,
  GitCommitSummary,
  GitHistoryOptions,
  GitStashEntry,
} from '@/types/gitOperations'
import { GitOperationError } from '@electron/services/git/errors'
import { readGitTextBlob } from '@electron/services/git/blobPreview'
import { runGit } from '@electron/services/git/helpers'
import { resolveCommit } from '@electron/services/git/operationValidation'
import { validateFilePath } from '@electron/services/git/pathSafety'
import { gitValue } from '@electron/services/git/repositoryState'
import type { GitFileDiff } from '@electron/services/git/types'
import { gitPreviewUnavailable } from '@electron/services/git/textPreview'

export const readHistory = async (
  root: string,
  options: GitHistoryOptions = {},
): Promise<GitCommitSummary[]> => {
  const limit = options.limit ?? 50
  const skip = options.skip ?? 0
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 200 ||
    !Number.isInteger(skip) ||
    skip < 0 ||
    skip > 100_000
  ) {
    throw new GitOperationError('git_invalid_input', 'Invalid Git history pagination')
  }
  if (!(await gitValue(root, ['rev-parse', '--verify', 'HEAD']))) return []
  const { stdout } = await runGit(root, [
    'log',
    `--max-count=${limit}`,
    `--skip=${skip}`,
    '--format=%H%x00%h%x00%s%x00%an%x00%aI%x00%P',
    '-z',
  ])
  const fields = stdout.split('\0')
  const commits: GitCommitSummary[] = []
  for (let index = 0; index + 5 < fields.length; index += 6) {
    commits.push({
      hash: fields[index]!,
      shortHash: fields[index + 1]!,
      subject: fields[index + 2]!,
      author: fields[index + 3]!,
      date: fields[index + 4]!,
      parents: fields[index + 5]!.split(' ').filter(Boolean),
    })
  }
  return commits
}

export const readBranches = async (root: string): Promise<GitBranchSummary[]> => {
  const { stdout } = await runGit(root, [
    'for-each-ref',
    '--format=%(refname)%00%(HEAD)',
    'refs/heads',
    'refs/remotes',
  ])
  return stdout
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [ref = '', head] = line.split('\0')
      return {
        name: ref.replace(/^refs\/(?:heads|remotes)\//, ''),
        current: head === '*',
        remote: ref.startsWith('refs/remotes/'),
      }
    })
}

export const readStashes = async (root: string): Promise<GitStashEntry[]> => {
  const { stdout } = await runGit(root, ['stash', 'list', '--format=%gd%x00%H%x00%s', '-z'])
  const fields = stdout.split('\0')
  const entries: GitStashEntry[] = []
  for (let index = 0; index + 2 < fields.length; index += 3) {
    entries.push({ ref: fields[index]!, hash: fields[index + 1]!, subject: fields[index + 2]! })
  }
  return entries
}

export const readCommitFiles = async (root: string, commit: unknown): Promise<GitCommitFile[]> => {
  const hash = await resolveCommit(root, commit)
  // Diff merges against the first parent and initial commits against the empty tree.
  const parent = (await runGit(root, ['rev-list', '--parents', '-n', '1', hash])).stdout
    .trim()
    .split(' ')[1]
  const args = parent
    ? ['diff', parent, hash]
    : ['diff-tree', '--root', '--no-commit-id', '-r', hash]
  const { stdout } = await runGit(root, [
    ...args,
    '--name-status',
    '-z',
    '--find-renames',
    '--no-ext-diff',
    '--no-textconv',
  ])
  const parts = stdout.split('\0').filter(Boolean)
  const files: GitCommitFile[] = []
  for (let index = 0; index < parts.length;) {
    const status = parts[index++]!
    const first = parts[index++]!
    if (status.startsWith('R') || status.startsWith('C')) {
      files.push({ path: parts[index++]!, old_path: first, status })
    } else files.push({ path: first, status })
  }
  return files
}

export const readCommitDiff = async (
  root: string,
  commit: unknown,
  file: unknown,
  oldFile?: unknown,
): Promise<GitFileDiff> => {
  const hash = await resolveCommit(root, commit)
  const filePath = validateFilePath(file)
  const oldPath = oldFile === undefined ? null : validateFilePath(oldFile)
  const parent = (await runGit(root, ['rev-list', '--parents', '-n', '1', hash])).stdout
    .trim()
    .split(' ')[1]
  const metadata = {
    path: filePath,
    old_path: oldPath,
    original_label: parent ? parent.slice(0, 8) : 'Empty',
    modified_label: hash.slice(0, 8),
  }
  try {
    const [original, modified] = await Promise.all([
      parent ? readGitTextBlob(root, parent, oldPath ?? filePath) : Promise.resolve(''),
      readGitTextBlob(root, hash, filePath),
    ])
    return { ...metadata, original_content: original ?? '', modified_content: modified ?? '' }
  } catch (error) {
    return {
      ...metadata,
      ...gitPreviewUnavailable(error, filePath),
      original_content: '',
      modified_content: '',
    }
  }
}
