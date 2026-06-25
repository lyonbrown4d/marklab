import type {
  StartedWorkspaceSidecar,
  WorkspaceSidecarManagerOptions,
  WorkspaceSidecarRuntime,
} from '@electron/services/knowledgeEngine/workspaceSidecarTypes.js'
import {
  createWorkspaceSidecarIdentity,
  type WorkspaceSidecarIdentity,
} from '@electron/services/knowledgeEngine/workspaceIdentity.js'
import {
  createWorkspaceSidecarSpawnPlan,
  type WorkspaceSidecarSpawnPlan,
} from '@electron/services/knowledgeEngine/workspaceSidecarSpawnPlan.js'
import { startGrpcSidecar } from '@electron/services/knowledgeEngine/workspaceSidecarStarter.js'

type OpenWorkspaceSidecarRuntimeInput = {
  workspaceId: string
  indexPath: string
  openWorkspace?: boolean
  runtimes: Map<string, WorkspaceSidecarRuntime>
  options: WorkspaceSidecarManagerOptions
  close: (workspaceId: string) => Promise<void>
}

export const openWorkspaceSidecarRuntime = async ({
  workspaceId,
  indexPath,
  openWorkspace,
  runtimes,
  options,
  close,
}: OpenWorkspaceSidecarRuntimeInput): Promise<void> => {
  const existing = runtimes.get(workspaceId)
  if (existing?.indexPath === indexPath && existing.state === 'ready') {
    existing.lastActivityAt = Date.now()
    return
  }

  if (existing) {
    await close(workspaceId)
  }

  const now = Date.now()
  const identity = createWorkspaceSidecarIdentity({
    appDataDir: options.appDataDir,
    workspaceId,
    indexPath,
  })
  const spawnPlan = createSpawnPlan(options, identity)
  const openingRuntime: WorkspaceSidecarRuntime = {
    workspaceId,
    indexPath,
    identity,
    spawnPlan,
    state: 'opening',
    openedAt: now,
    lastActivityAt: now,
  }
  runtimes.set(workspaceId, openingRuntime)

  try {
    const started = await startSidecar(options, spawnPlan, identity)
    await started.client.getCapabilities(identity.workspaceInstanceId)
    if (openWorkspace ?? true) {
      await started.client.openWorkspace(indexPath)
    }
    runtimes.set(workspaceId, {
      ...openingRuntime,
      address: started.address,
      child: started.child,
      client: started.client,
      lastActivityAt: Date.now(),
      state: 'ready',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    runtimes.set(workspaceId, {
      ...openingRuntime,
      lastActivityAt: Date.now(),
      lastError: message,
      state: 'error',
    })
    throw error
  }
}

const createSpawnPlan = (
  options: WorkspaceSidecarManagerOptions,
  identity: WorkspaceSidecarIdentity,
): WorkspaceSidecarSpawnPlan => {
  const binary = options.resolveBinary()
  if (!binary?.exists) {
    throw new Error('Knowledge engine binary not found. Run pnpm knowledge:build first.')
  }

  return createWorkspaceSidecarSpawnPlan({
    binary,
    identity,
  })
}

const startSidecar = (
  options: WorkspaceSidecarManagerOptions,
  plan: WorkspaceSidecarSpawnPlan,
  identity: WorkspaceSidecarIdentity,
): Promise<StartedWorkspaceSidecar> => {
  return options.startSidecar
    ? options.startSidecar(plan, identity)
    : startGrpcSidecar(plan, identity, options.logger)
}
