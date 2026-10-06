import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { Logger } from '@electron/services/logger'
import type { FsPathMetadata, FsStateData } from '@electron/services/workspace/types'
import { readNodePathMetadata } from '@electron/services/workspace/workspaceNodePathMetadata'
import { trySidecarPathMetadata } from '@electron/services/workspace/workspaceSidecarFileBridge'

type WorkspacePathMetadataOptions = {
  absolutePath: string
  knowledgeEngineService?: KnowledgeEngineService
  logger: Logger
  path: string
  state: FsStateData
}

export const readWorkspacePathMetadata = async ({
  absolutePath,
  knowledgeEngineService,
  logger,
  path,
  state,
}: WorkspacePathMetadataOptions): Promise<FsPathMetadata> => {
  const sidecarMetadata = await trySidecarPathMetadata({
    knowledgeEngineService,
    logger,
    path,
    state,
  })
  if (sidecarMetadata) return sidecarMetadata
  return readNodePathMetadata(path, absolutePath)
}
