import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type { Logger } from '@electron/services/logger'
import type { WorkspaceBufferWriteFile } from '@electron/services/workspace/workspaceBuffers'
import { trySidecarWriteFile } from '@electron/services/workspace/workspaceSidecarFileBridge'

export const writeBufferedWorkspaceFile = async ({
  args,
  beforeWrite,
  knowledgeEngineService,
  localHistory,
  logger,
}: {
  args: Parameters<WorkspaceBufferWriteFile>[0]
  beforeWrite: () => void
  knowledgeEngineService?: KnowledgeEngineService
  localHistory: LocalHistoryServiceContract
  logger: Logger
}): Promise<void> => {
  if (!args.state) {
    throw new Error(`Missing workspace session for buffered write: ${args.relativePath}`)
  }
  const sidecarWritten = await trySidecarWriteFile({
    knowledgeEngineService,
    logger,
    path: args.relativePath,
    state: args.state,
    content: args.content,
    beforeWrite,
  })
  if (!sidecarWritten) await args.writeWithNode()
  try {
    await localHistory.capture(
      { kind: args.state.rootKind, path: args.state.rootPath },
      args.relativePath,
      args.content,
    )
  } catch (error) {
    logger.warn('local history snapshot failed', { error, path: args.relativePath })
  }
}
