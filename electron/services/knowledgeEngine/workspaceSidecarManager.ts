import type { KnowledgeEngineStatus } from '@electron/services/knowledgeEngine/types.js'
import {
  createWorkspaceSidecarIdentity,
  type WorkspaceSidecarIdentity,
} from '@electron/services/knowledgeEngine/workspaceIdentity.js'
import type { Logger } from '@electron/services/logger.js'

export type WorkspaceSidecarRuntimeState = 'opening' | 'ready' | 'closing' | 'error'

export type WorkspaceSidecarRuntime = {
  workspaceId: string
  indexPath: string
  identity: WorkspaceSidecarIdentity
  state: WorkspaceSidecarRuntimeState
  openedAt: number
  lastActivityAt: number
  lastError?: string
}

export type WorkspaceSidecarRuntimeSummary = Omit<WorkspaceSidecarRuntime, 'identity'> & {
  identity: Pick<
    WorkspaceSidecarIdentity,
    'canonicalRoot' | 'engineDataDir' | 'workspaceInstanceId'
  >
}

export type WorkspaceSidecarTransport = {
  getStatus: () => KnowledgeEngineStatus
  initialize: () => Promise<unknown>
  request: (method: string, params?: unknown) => Promise<unknown>
}

type WorkspaceSidecarManagerOptions = {
  appDataDir: string
  logger: Logger
  transport: WorkspaceSidecarTransport
}

export class WorkspaceSidecarManager {
  private readonly runtimes = new Map<string, WorkspaceSidecarRuntime>()

  constructor(private readonly options: WorkspaceSidecarManagerOptions) {}

  listActive(): WorkspaceSidecarRuntimeSummary[] {
    return [...this.runtimes.values()].map((runtime) => ({
      ...runtime,
      identity: {
        canonicalRoot: runtime.identity.canonicalRoot,
        engineDataDir: runtime.identity.engineDataDir,
        workspaceInstanceId: runtime.identity.workspaceInstanceId,
      },
    }))
  }

  async open(workspaceId: string, indexPath: string): Promise<void> {
    const existing = this.runtimes.get(workspaceId)
    if (existing?.indexPath === indexPath && existing.state === 'ready') {
      existing.lastActivityAt = Date.now()
      return
    }

    if (existing) {
      await this.close(workspaceId)
    }

    const now = Date.now()
    const identity = createWorkspaceSidecarIdentity({
      appDataDir: this.options.appDataDir,
      workspaceId,
      indexPath,
    })
    this.runtimes.set(workspaceId, {
      workspaceId,
      indexPath,
      identity,
      state: 'opening',
      openedAt: now,
      lastActivityAt: now,
    })

    try {
      await this.options.transport.initialize()
      await this.options.transport.request('workspace/open', { workspaceId, indexPath })
      this.runtimes.set(workspaceId, {
        workspaceId,
        indexPath,
        identity,
        state: 'ready',
        openedAt: now,
        lastActivityAt: Date.now(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.runtimes.set(workspaceId, {
        workspaceId,
        indexPath,
        identity,
        state: 'error',
        openedAt: now,
        lastActivityAt: Date.now(),
        lastError: message,
      })
      throw error
    }
  }

  async close(workspaceId: string): Promise<void> {
    const runtime = this.runtimes.get(workspaceId)
    if (!runtime) return

    this.runtimes.set(workspaceId, {
      ...runtime,
      state: 'closing',
      lastActivityAt: Date.now(),
    })

    try {
      await this.options.transport.request('workspace/close', { workspaceId })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.options.logger.warn(
        `[knowledge-engine] Failed to close workspace ${workspaceId}: ${message}`,
      )
    } finally {
      this.runtimes.delete(workspaceId)
    }
  }

  async request(
    workspaceId: string,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const runtime = this.runtimes.get(workspaceId)
    if (!runtime || runtime.state !== 'ready') {
      throw new Error(`Knowledge sidecar workspace is not ready: ${workspaceId}`)
    }

    runtime.lastActivityAt = Date.now()
    return this.options.transport.request(method, {
      ...(params ?? {}),
      workspaceId,
    })
  }

  clear(): void {
    this.runtimes.clear()
  }
}
