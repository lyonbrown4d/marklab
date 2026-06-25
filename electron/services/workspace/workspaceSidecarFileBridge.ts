import { createHash } from 'node:crypto'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import type { KnowledgeWorkspacePathMutation } from '@electron/services/knowledgeEngine/knowledgeEngineTypes.js'
import type { Logger } from '@electron/services/logger.js'
import type {
  FsPathMetadata,
  FsRootInfo,
  FsSnapshot,
  FsStateData,
} from '@electron/services/workspace/types.js'

type WorkspaceSidecarRuntime = { workspaceId: string; workspaceRoot: string }

type SidecarBridgeOptions = {
  knowledgeEngineService?: KnowledgeEngineService
  logger: Logger
  state: FsStateData
}

type SidecarPathOptions = SidecarBridgeOptions & { path: string }

export const trySidecarSnapshot = async (
  options: SidecarBridgeOptions & { root: FsRootInfo },
): Promise<FsSnapshot | null> => {
  const runtime = sidecarRuntime(options)
  if (!runtime) return null
  try {
    return await options.knowledgeEngineService!.getWorkspaceFileSnapshot(
      runtime.workspaceId,
      runtime.workspaceRoot,
      options.root,
    )
  } catch (error) {
    options.logger.warn('workspace vfs snapshot failed; falling back to node filesystem', { error })
    return null
  }
}

export const trySidecarReadFile = async (options: SidecarPathOptions): Promise<string | null> => {
  const runtime = sidecarRuntime(options)
  if (!runtime) return null
  try {
    return await options.knowledgeEngineService!.readWorkspaceFile(
      runtime.workspaceId,
      runtime.workspaceRoot,
      options.path,
    )
  } catch (error) {
    options.logger.warn('workspace vfs read failed; falling back to node filesystem', {
      error,
      path: options.path,
    })
    return null
  }
}

export const trySidecarPathMetadata = async (
  options: SidecarPathOptions,
): Promise<FsPathMetadata | null> => {
  const runtime = sidecarRuntime(options)
  if (!runtime) return null
  try {
    return await options.knowledgeEngineService!.getWorkspacePathMetadata(
      runtime.workspaceId,
      runtime.workspaceRoot,
      options.path,
    )
  } catch (error) {
    options.logger.warn('workspace vfs metadata failed; falling back to node filesystem', {
      error,
      path: options.path,
    })
    return null
  }
}

export const trySidecarPathMutation = async (
  options: SidecarPathOptions & {
    mutate: (
      service: KnowledgeEngineService,
      runtime: WorkspaceSidecarRuntime,
    ) => Promise<KnowledgeWorkspacePathMutation>
  },
): Promise<KnowledgeWorkspacePathMutation | null> => {
  const runtime = sidecarRuntime(options)
  if (!runtime) return null
  try {
    return await options.mutate(options.knowledgeEngineService!, runtime)
  } catch (error) {
    options.logger.warn('workspace vfs mutation failed; falling back to node filesystem', {
      error,
      path: options.path,
    })
    return null
  }
}

const sidecarRuntime = (options: SidecarBridgeOptions): WorkspaceSidecarRuntime | null => {
  if (!options.knowledgeEngineService || options.state.rootKind === 'single') return null
  const raw = `${options.state.rootKind}|${options.state.rootPath}|${options.state.singleFile ?? ''}`
  const workspaceId = `vfs:${createHash('sha256').update(raw).digest('hex')}`
  return { workspaceId, workspaceRoot: options.state.rootPath }
}
