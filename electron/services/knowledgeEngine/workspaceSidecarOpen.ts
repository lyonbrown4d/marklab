import type {
  StartedWorkspaceSidecar,
  WorkspaceSidecarManagerOptions,
  WorkspaceSidecarRuntime,
} from '@electron/services/knowledgeEngine/workspaceSidecarTypes'
import {
  createWorkspaceSidecarIdentity,
  type WorkspaceSidecarIdentity,
} from '@electron/services/knowledgeEngine/workspaceIdentity'
import { startNodeSidecar } from '@electron/services/knowledgeEngine/nodeSidecarProcess'
import {
  createWorkspaceSidecarSpawnPlan,
  type WorkspaceSidecarSpawnPlan,
} from '@electron/services/knowledgeEngine/workspaceSidecarSpawnPlan'

type OpenWorkspaceSidecarRuntimeInput = {
  workspaceId: string
  indexPath: string
  openWorkspace?: boolean
  runtimes: Map<string, WorkspaceSidecarRuntime>
  options: WorkspaceSidecarManagerOptions
  close: (workspaceId: string) => Promise<void>
  isCurrent?: () => boolean
  shouldOpenWorkspace?: () => boolean
}

export const openWorkspaceSidecarRuntime = async ({
  workspaceId,
  indexPath,
  openWorkspace,
  runtimes,
  options,
  close,
  isCurrent = () => true,
  shouldOpenWorkspace = () => openWorkspace ?? true,
}: OpenWorkspaceSidecarRuntimeInput): Promise<void> => {
  const existing = runtimes.get(workspaceId)
  if (existing?.indexPath === indexPath && existing.state === 'ready') {
    existing.lastActivityAt = Date.now()
    if (shouldOpenWorkspace() && !existing.workspaceOpened && existing.client) {
      const upgradeStartedAt = Date.now()
      await existing.client.openWorkspace(indexPath)
      existing.workspaceOpened = true
      options.logger.info('knowledge workspace runtime upgraded', {
        durationMs: Math.max(0, Date.now() - upgradeStartedAt),
        workspaceKey: existing.identity.workspaceInstanceId.slice(0, 12),
      })
    }
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
  const spawnPlan = createSpawnPlan()
  const openingRuntime: WorkspaceSidecarRuntime = {
    workspaceId,
    indexPath,
    identity,
    spawnPlan,
    state: 'opening',
    openedAt: now,
    lastActivityAt: now,
    workspaceOpened: false,
  }
  runtimes.set(workspaceId, openingRuntime)

  let started: StartedWorkspaceSidecar | null = null
  let disposed = false
  const ensureCurrent = async (): Promise<void> => {
    if (isCurrent()) return
    if (started && !disposed) {
      disposed = true
      await disposeCancelledRuntime(started)
    }
    throw new Error(`Knowledge workspace runtime opening was cancelled: ${workspaceId}`)
  }

  try {
    started = await startSidecar(options, spawnPlan, identity)
    await ensureCurrent()
    await started.client.getCapabilities(identity.workspaceInstanceId)
    await ensureCurrent()
    const workspaceOpened = shouldOpenWorkspace()
    if (workspaceOpened) {
      await started.client.openWorkspace(indexPath)
      await ensureCurrent()
    }
    const readyRuntime: WorkspaceSidecarRuntime = {
      ...openingRuntime,
      address: started.address,
      child: started.child,
      client: started.client,
      lastActivityAt: Date.now(),
      state: 'ready',
      workspaceOpened,
    }
    runtimes.set(workspaceId, readyRuntime)
    options.logger.info('knowledge workspace runtime ready', {
      durationMs: Math.max(0, Date.now() - now),
      openWorkspace: workspaceOpened,
      workspaceKey: identity.workspaceInstanceId.slice(0, 12),
    })
    const startedChild = started.child
    startedChild?.onExit?.((code) => {
      const current = runtimes.get(workspaceId)
      if (!current || current.child !== startedChild || current.state === 'closing') return
      runtimes.set(workspaceId, {
        ...current,
        lastActivityAt: Date.now(),
        lastError: `Knowledge utility process exited with code ${code}.`,
        state: 'error',
      })
    })
  } catch (error) {
    if (!isCurrent()) throw error
    const message = error instanceof Error ? error.message : String(error)
    runtimes.set(workspaceId, {
      ...openingRuntime,
      lastActivityAt: Date.now(),
      lastError: message,
      state: 'error',
    })
    options.logger.warn('knowledge workspace runtime failed', {
      durationMs: Math.max(0, Date.now() - now),
      error,
      openWorkspace: shouldOpenWorkspace(),
      workspaceKey: identity.workspaceInstanceId.slice(0, 12),
    })
    throw error
  }
}

const disposeCancelledRuntime = async (started: StartedWorkspaceSidecar): Promise<void> => {
  await started.client.shutdown('workspace opening cancelled').catch(() => undefined)
  started.client.close()
  if (started.child && !started.child.killed) started.child.kill()
}

const createSpawnPlan = (): WorkspaceSidecarSpawnPlan => {
  return createWorkspaceSidecarSpawnPlan()
}

const startSidecar = (
  options: WorkspaceSidecarManagerOptions,
  plan: WorkspaceSidecarSpawnPlan,
  identity: WorkspaceSidecarIdentity,
): Promise<StartedWorkspaceSidecar> => {
  if (options.startSidecar) return options.startSidecar(plan, identity)
  return startNodeSidecar(identity, options.logger)
}
