import fs from 'node:fs'
import path from 'node:path'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import type { Logger } from '@electron/services/logger.js'
import type { FsStateData } from '@electron/services/workspace/types.js'
import {
  trySidecarPathMutation,
  trySidecarWriteFile,
} from '@electron/services/workspace/workspaceSidecarFileBridge.js'
import { stringArg } from '@electron/services/workspace/workspaceUtils.js'

export class WorkspaceCreateFileConflictError extends Error {
  readonly code = 'workspace_file_exists' as const

  constructor(readonly relativePath: string) {
    super('Workspace file already exists: ' + relativePath)
    this.name = 'WorkspaceCreateFileConflictError'
  }
}
export type CreateWorkspaceFileEntryOptions = {
  hasDirtyBuffer?: (relativePath: string) => boolean
  knowledgeEngineService?: KnowledgeEngineService
  logger: Logger
  resolveRelativePath: (relativePath: string) => string
  scheduleSnapshotChanged: (options?: { restartWatcher?: boolean }) => void
  setCleanFile: (relativePath: string, content: string) => void
  state: FsStateData
  value: unknown
}

export const createWorkspaceFileEntry = async ({
  hasDirtyBuffer,
  knowledgeEngineService,
  logger,
  resolveRelativePath,
  scheduleSnapshotChanged,
  setCleanFile,
  state,
  value,
}: CreateWorkspaceFileEntryOptions): Promise<void> => {
  const { relativePath, content } = parseWorkspaceCreateFileRequest(value)
  if (hasDirtyBuffer?.(relativePath)) {
    throw new WorkspaceCreateFileConflictError(relativePath)
  }
  const sidecarMutation = await trySidecarPathMutation({
    knowledgeEngineService,
    logger,
    mutate: (service, runtime) =>
      service.createWorkspaceFile(runtime.workspaceId, runtime.workspaceRoot, relativePath),
    path: relativePath,
    state,
  })

  if (sidecarMutation) {
    if (sidecarMutation.changed) {
      await writeCreatedFileContentWithSidecar({
        content,
        knowledgeEngineService,
        logger,
        relativePath,
        state,
      })
      setCleanFile(relativePath, content)
    } else {
      throw new WorkspaceCreateFileConflictError(relativePath)
    }
    scheduleCreatedFileChanged(scheduleSnapshotChanged, logger, relativePath)
    return
  }

  const created = await createFileWithNode(resolveRelativePath(relativePath), content)
  if (!created) throw new WorkspaceCreateFileConflictError(relativePath)
  setCleanFile(relativePath, content)
  scheduleCreatedFileChanged(scheduleSnapshotChanged, logger, relativePath)
}

export type WorkspaceCreateFileRequest = {
  relativePath: string
  content: string
}

export const parseWorkspaceCreateFileRequest = (value: unknown): WorkspaceCreateFileRequest => ({
  relativePath: stringArg(value, 'path'),
  content: optionalStringArg(value, 'content') ?? '',
})

export const writeCreatedFileContentWithSidecar = async ({
  content,
  knowledgeEngineService,
  logger,
  relativePath,
  state,
}: {
  content: string
  knowledgeEngineService?: KnowledgeEngineService
  logger: Logger
  relativePath: string
  state: FsStateData
}): Promise<void> => {
  if (!content) return
  const written = await trySidecarWriteFile({
    knowledgeEngineService,
    logger,
    path: relativePath,
    state,
    content,
    beforeWrite: () => undefined,
  })
  if (!written) {
    throw new Error('Sidecar could not persist created file content: ' + relativePath)
  }
}

export const createFileWithNode = async (
  absolutePath: string,
  content: string,
): Promise<boolean> => {
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true })
  try {
    await fs.promises.writeFile(absolutePath, content, { encoding: 'utf8', flag: 'wx' })
    return true
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      return false
    }
    throw error
  }
}
const optionalStringArg = (value: unknown, key: string): string | null => {
  if (!value || typeof value !== 'object' || !(key in value)) return null
  const result = (value as Record<string, unknown>)[key]
  if (result == null) return null
  if (typeof result !== 'string') throw new Error(`${key} must be a string`)
  return result
}

const scheduleCreatedFileChanged = (
  scheduleSnapshotChanged: (options?: { restartWatcher?: boolean }) => void,
  logger: Logger,
  relativePath: string,
): void => {
  scheduleSnapshotChanged({ restartWatcher: true })
  logger.info('file created', { path: relativePath })
}
