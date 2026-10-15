import { GitOperationError } from '@electron/services/git/errors'
import { runGit, runGitBlobBuffer } from '@electron/services/git/helpers'
import { assertPreviewSize, decodeTextPreview } from '@electron/services/git/textPreview'

type GitObjectMetadata = { hash: string; type: string; size: number }

const readObjectMetadata = async (
  root: string,
  spec: string,
): Promise<GitObjectMetadata | null> => {
  const { stdout } = await runGit(
    root,
    ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)', '-z'],
    { input: `${spec}\0` },
  )
  if (stdout === `${spec} missing\n`) return null
  const match = /^([a-f0-9]{40}|[a-f0-9]{64}) (\w+) (\d+)\n$/i.exec(stdout)
  if (!match || !Number.isSafeInteger(Number(match[3]))) {
    throw new GitOperationError(
      'git_command_failed',
      'Git returned invalid object metadata for a diff preview',
    )
  }
  return { hash: match[1]!, type: match[2]!, size: Number(match[3]) }
}

const resolveBlob = async (
  root: string,
  revision: string | null,
  file: string,
): Promise<string | null> => {
  if (revision === null) {
    const { stdout } = await runGit(root, [
      '--literal-pathspecs',
      'ls-files',
      '--stage',
      '-z',
      '--',
      file,
    ])
    const entry = stdout
      .split('\0')
      .find(
        (value) =>
          value.slice(value.indexOf('\t') + 1) === file && /^\d{6} [a-f0-9]+ 0\t/.test(value),
      )
    return entry?.split(' ')[1] ?? null
  }
  const commit = revision === 'HEAD' ? await readObjectMetadata(root, 'HEAD') : null
  if (revision === 'HEAD' && !commit) return null // The first commit has no HEAD tree yet.
  const { stdout } = await runGit(root, [
    '--literal-pathspecs',
    'ls-tree',
    '-z',
    '--full-tree',
    commit?.hash ?? revision,
    '--',
    file,
  ])
  const entry = stdout.split('\0').find((value) => value.slice(value.indexOf('\t') + 1) === file)
  if (!entry) return null
  const match = /^\d{6} (\w+) ([a-f0-9]{40}|[a-f0-9]{64})\t/i.exec(entry)
  if (!match || match[1] !== 'blob')
    throw new GitOperationError(
      'git_invalid_input',
      'Diff preview requires a regular Git file blob',
    )
  return match[2]!
}

export const readGitTextBlob = async (
  root: string,
  revision: string | null,
  file: string,
): Promise<string | null> => {
  const hash = await resolveBlob(root, revision, file)
  if (!hash) return null // Only a missing tree/index entry represents an empty side.
  return readGitObjectTextBlob(root, hash)
}

export const readGitObjectTextBlob = async (root: string, hash: string): Promise<string> => {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(hash)) {
    throw new GitOperationError('git_invalid_input', 'A full Git blob hash is required')
  }
  const metadata = await readObjectMetadata(root, hash)
  if (!metadata)
    throw new GitOperationError(
      'git_command_failed',
      'Git blob is missing or corrupt; diff preview is unavailable',
    )
  if (metadata.type !== 'blob')
    throw new GitOperationError(
      'git_invalid_input',
      'Diff preview requires a regular Git file blob',
    )
  assertPreviewSize(metadata.size)
  return decodeTextPreview(await runGitBlobBuffer(root, metadata.hash))
}
