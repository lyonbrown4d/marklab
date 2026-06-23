import type { KnowledgeEngineStatus } from '@electron/services/knowledgeEngine/types.js'
import type { Logger } from '@electron/services/logger.js'

export type WorkspaceSidecarRuntimeState = 'opening' | 'ready' | 'closing' | 'error'

export type WorkspaceSidecarRuntime = {
  workspaceId: string
  indexPath: string
  state: WorkspaceSidecarRuntimeState
  openedAt: number
  lastActivityAt: number
  lastError?: string
}

export type WorkspaceSidecarTransport = {
  getStatus: () => KnowledgeEngineStatus
  initialize: () => Promise<unknown>
  request: (method: string, params?: unknown) => Promise<unknown>
}

type WorkspaceSidecarManagerOptions = {
  logger: Logger
  transport: WorkspaceSidecarTransport
}

export class WorkspaceSidecarManager {
  private readonly runtimes = new Map<string, WorkspaceSidecarRuntime>()

  constructor(private readonly options: WorkspaceSidecarManagerOptions) {}

  listActive(): WorkspaceSidecarRuntime[] {
    return [...this.runtimes.values()].map((runtime) => ({ ...runtime }))
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
    this.runtimes.set(workspaceId, {
      workspaceId,
      indexPath,
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
        state: 'ready',
        openedAt: now,
        lastActivityAt: Date.now(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.runtimes.set(workspaceId, {
        workspaceId,
        indexPath,
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
