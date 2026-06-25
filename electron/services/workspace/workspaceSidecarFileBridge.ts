import { createHash } from 'node:crypto'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import type { KnowledgeWorkspacePathMutation } from '@electron/services/knowledgeEngine/knowledgeEngineTypes.js'
import { fileLabel } from '@electron/services/workspace/markdown.js'
import type { Logger } from '@electron/services/logger.js'
import type {
  FsGraph,
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

type WorkspaceSidecarGraphService = KnowledgeEngineService & {
  buildWorkspaceGraph?: (
    workspaceId: string,
    workspaceRoot: string,
    documents: Array<{ path: string; title?: string; content: string }>,
    knownPaths: { paths: string[]; assetPaths: string[] },
  ) => Promise<FsGraph>
  buildOutlineGraph?: (
    workspaceId: string,
    workspaceRoot: string,
    path: string,
    content: string,
  ) => Promise<FsGraph>
}
type WorkspaceSidecarWriteService = KnowledgeEngineService & {
  writeWorkspaceFile?: (
    workspaceId: string,
    workspaceRoot: string,
    path: string,
    content: string,
  ) => Promise<unknown>
}

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
    options.logger.error('workspace vfs snapshot failed', { error })
    throw error
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
    options.logger.error('workspace vfs read failed', {
      error,
      path: options.path,
    })
    throw error
  }
}

export const trySidecarWriteFile = async (
  options: SidecarPathOptions & { content: string; beforeWrite?: () => void },
): Promise<boolean> => {
  const runtime = sidecarRuntime(options)
  const writeWorkspaceFile = (
    options.knowledgeEngineService as WorkspaceSidecarWriteService | undefined
  )?.writeWorkspaceFile
  if (!runtime || typeof writeWorkspaceFile !== 'function') return false
  try {
    options.beforeWrite?.()
    await writeWorkspaceFile.call(
      options.knowledgeEngineService,
      runtime.workspaceId,
      runtime.workspaceRoot,
      options.path,
      options.content,
    )
    return true
  } catch (error) {
    options.logger.error('workspace vfs write failed', {
      error,
      path: options.path,
    })
    throw error
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
    options.logger.error('workspace vfs metadata failed', {
      error,
      path: options.path,
    })
    throw error
  }
}

export const trySidecarWorkspaceGraph = async (
  options: SidecarBridgeOptions & {
    documents: Array<{ path: string; content: string }>
    knownPaths: { paths: string[]; assetPaths: string[] }
  },
): Promise<FsGraph> => {
  const runtime = requireSidecarRuntime(options, 'workspace graph')
  const buildWorkspaceGraph = (
    options.knowledgeEngineService as WorkspaceSidecarGraphService | undefined
  )?.buildWorkspaceGraph
  if (typeof buildWorkspaceGraph !== 'function') {
    throw new Error('Knowledge sidecar workspace graph bridge is not available')
  }
  try {
    return await buildWorkspaceGraph.call(
      options.knowledgeEngineService,
      runtime.workspaceId,
      runtime.workspaceRoot,
      options.documents.map((document) => ({ ...document, title: fileLabel(document.path) })),
      options.knownPaths,
    )
  } catch (error) {
    options.logger.error('workspace graph sidecar failed', { error })
    throw error
  }
}

export const trySidecarOutlineGraph = async (
  options: SidecarPathOptions & { content: string },
): Promise<FsGraph> => {
  const runtime = requireSidecarRuntime(options, 'outline graph')
  const buildOutlineGraph = (
    options.knowledgeEngineService as WorkspaceSidecarGraphService | undefined
  )?.buildOutlineGraph
  if (typeof buildOutlineGraph !== 'function') {
    throw new Error('Knowledge sidecar outline graph bridge is not available')
  }
  try {
    return await buildOutlineGraph.call(
      options.knowledgeEngineService,
      runtime.workspaceId,
      runtime.workspaceRoot,
      options.path,
      options.content,
    )
  } catch (error) {
    options.logger.error('outline graph sidecar failed', {
      error,
      path: options.path,
    })
    throw error
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
    options.logger.error('workspace vfs mutation failed', {
      error,
      path: options.path,
    })
    throw error
  }
}

const requireSidecarRuntime = (
  options: SidecarBridgeOptions,
  capability: string,
): WorkspaceSidecarRuntime => {
  const runtime = sidecarRuntime(options)
  if (runtime) return runtime
  throw new Error(`Knowledge sidecar is required for ${capability}`)
}
const sidecarRuntime = (options: SidecarBridgeOptions): WorkspaceSidecarRuntime | null => {
  if (!options.knowledgeEngineService || options.state.rootKind === 'single') return null
  const raw = `${options.state.rootKind}|${options.state.rootPath}|${options.state.singleFile ?? ''}`
  const workspaceId = `vfs:${createHash('sha256').update(raw).digest('hex')}`
  return { workspaceId, workspaceRoot: options.state.rootPath }
}
