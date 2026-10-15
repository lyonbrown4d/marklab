import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { GitConflictSnapshot } from '@/types/gitConflicts'
import { readGitObjectTextBlob } from '@electron/services/git/blobPreview'
import {
  readConflictMarkerConfig,
  type ConflictMarkerConfig,
} from '@electron/services/git/conflictMarkers'
import { GitOperationError } from '@electron/services/git/errors'
import { readUtf8RepoFile, runGit } from '@electron/services/git/helpers'
import { validateFilePath, validateSelectedPaths } from '@electron/services/git/pathSafety'
import { readStatusSnapshot } from '@electron/services/git/repositoryState'

export type ConflictStage = { mode: string; hash: string; stage: 1 | 2 | 3 }
export type ConflictDetails = {
  snapshot: GitConflictSnapshot
  stages: ConflictStage[]
  markerConfig: ConflictMarkerConfig
}

export const conflictRevision = (
  file: string,
  stages: ConflictStage[],
  result: string,
  deleted: boolean,
  markerConfig: ConflictMarkerConfig,
): string => {
  return createHash('sha256')
    .update(JSON.stringify({ path: file, stages, result, deleted, markerConfig }))
    .digest('hex')
}

export const readConflictDetails = async (
  root: string,
  filePath: unknown,
): Promise<ConflictDetails> => {
  const file = validateFilePath(filePath)
  const status = await readStatusSnapshot(root)
  if (!status.conflicts.some((change) => change.path === file)) {
    throw new GitOperationError(
      'git_invalid_input',
      'Selected file is no longer an unresolved Git conflict; refresh the conflict view',
    )
  }
  await validateSelectedPaths(root, [file], status)
  const { stdout } = await runGit(root, [
    '--literal-pathspecs',
    'ls-files',
    '--unmerged',
    '-z',
    '--',
    file,
  ])
  const stages: ConflictStage[] = []
  for (const entry of stdout.split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t')
    if (entry.slice(tab + 1) !== file) continue
    const match = /^(\d{6}) ([a-f0-9]{40}|[a-f0-9]{64}) ([123])$/i.exec(entry.slice(0, tab))
    if (!match)
      throw new GitOperationError(
        'git_command_failed',
        'Git returned invalid conflict index stages',
      )
    if (match[1] !== '100644' && match[1] !== '100755') {
      throw new GitOperationError(
        'git_workspace_boundary',
        'Conflict editing supports regular files only; symlink and submodule stages are refused',
      )
    }
    stages.push({ mode: match[1], hash: match[2]!, stage: Number(match[3]) as 1 | 2 | 3 })
  }
  stages.sort((left, right) => left.stage - right.stage)
  if (!stages.length || new Set(stages.map((stage) => stage.stage)).size !== stages.length) {
    throw new GitOperationError(
      'git_command_failed',
      'Git conflict index stages are missing or duplicated',
    )
  }
  const [base, ours, theirs] = await Promise.all(
    [1, 2, 3].map(async (number) => {
      const entry = stages.find((stage) => stage.stage === number)
      return entry ? readGitObjectTextBlob(root, entry.hash) : null
    }),
  )
  const stat = await fs.lstat(path.join(root, file)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  const deleted = !stat
  const result = deleted ? '' : await readUtf8RepoFile(root, file)
  const markerConfig = await readConflictMarkerConfig(root, file)
  const snapshot: GitConflictSnapshot = {
    path: file,
    base: base ?? null,
    ours: ours ?? null,
    theirs: theirs ?? null,
    result,
    deleted,
    markerSize: markerConfig.markerSize,
    revision: conflictRevision(file, stages, result, deleted, markerConfig),
  }
  return { snapshot, stages, markerConfig }
}
