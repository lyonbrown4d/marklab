import type { GitConflictSaveRequest, GitConflictSaveResult } from '@/types/gitConflicts'
import { hasConflictMarkers } from '@electron/services/git/conflictMarkers'
import { writeConflictFile } from '@electron/services/git/conflictFile'
import { conflictRevision, readConflictDetails } from '@electron/services/git/conflictSnapshot'
import { GitOperationError } from '@electron/services/git/errors'
import { runGit } from '@electron/services/git/helpers'
import { readStatusSnapshot } from '@electron/services/git/repositoryState'
import { assertPreviewSize, decodeTextPreview } from '@electron/services/git/textPreview'

const parseSaveRequest = (value: unknown): GitConflictSaveRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GitOperationError('git_invalid_input', 'Conflict save request is required')
  const request = value as GitConflictSaveRequest
  if (
    Object.keys(value).some(
      (key) => !['path', 'content', 'revision', 'stage', 'deleteFile'].includes(key),
    ) ||
    typeof request.path !== 'string' ||
    typeof request.content !== 'string' ||
    typeof request.revision !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(request.revision) ||
    (request.stage !== undefined && typeof request.stage !== 'boolean') ||
    (request.deleteFile !== undefined && typeof request.deleteFile !== 'boolean')
  ) {
    throw new GitOperationError('git_invalid_input', 'Invalid conflict save request')
  }
  assertPreviewSize(Buffer.byteLength(request.content, 'utf8'))
  const bytes = Buffer.from(request.content, 'utf8')
  if (decodeTextPreview(bytes) !== request.content)
    throw new GitOperationError('git_invalid_input', 'Conflict result must be valid UTF-8 text')
  if (request.deleteFile && request.content !== '')
    throw new GitOperationError(
      'git_invalid_input',
      'A deleted conflict result must have empty content',
    )
  return request
}

export const saveConflictResult = async (
  root: string,
  value: unknown,
): Promise<GitConflictSaveResult> => {
  const request = parseSaveRequest(value)
  const { snapshot, stages, markerConfig } = await readConflictDetails(root, request.path)
  if (snapshot.revision !== request.revision.toLowerCase())
    throw new GitOperationError(
      'git_invalid_input',
      'Conflict changed outside this editor; refresh before saving',
    )
  if (
    request.stage &&
    !request.deleteFile &&
    hasConflictMarkers(request.content, markerConfig.markerSize)
  ) {
    throw new GitOperationError(
      'git_conflicts_present',
      'Remove all conflict markers before staging the resolved result',
    )
  }
  await writeConflictFile(
    root,
    snapshot.path,
    Buffer.from(request.content, 'utf8'),
    snapshot,
    !!request.deleteFile,
    (
      stages.find((stage) => stage.stage === 2) ??
      stages.find((stage) => stage.stage === 3) ??
      stages[0]
    )?.mode === '100755'
      ? 0o755
      : 0o644,
  )
  const revision = conflictRevision(
    snapshot.path,
    stages,
    request.content,
    !!request.deleteFile,
    markerConfig,
  )
  if (request.stage) await runGit(root, ['--literal-pathspecs', 'add', '-A', '--', snapshot.path])
  return { status: await readStatusSnapshot(root), revision, staged: !!request.stage }
}
