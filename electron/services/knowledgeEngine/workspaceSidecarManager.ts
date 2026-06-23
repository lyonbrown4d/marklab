import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

import { KnowledgeEngineGrpcClient } from '@electron/services/knowledgeEngine/grpcClient.js'
import type { KnowledgeEngineBinaryResolution } from '@electron/services/knowledgeEngine/types.js'
import {
  createWorkspaceSidecarIdentity,
  type WorkspaceSidecarIdentity,
} from '@electron/services/knowledgeEngine/workspaceIdentity.js'
import {
  createWorkspaceSidecarSpawnPlan,
  redactWorkspaceSidecarSpawnPlan,
  type WorkspaceSidecarSpawnPlan,
} from '@electron/services/knowledgeEngine/workspaceSidecarSpawnPlan.js'
import type { Logger } from '@electron/services/logger.js'
import type { FsSearchResult } from '@electron/services/workspace/types.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'

const SIDECAR_READY_TIMEOUT_MS = 5000

export type WorkspaceSidecarRuntimeState = 'opening' | 'ready' | 'closing' | 'error'

export type WorkspaceSidecarClient = {
  close: () => void
  closeWorkspace: () => Promise<void>
  getCapabilities: (workspaceInstanceId: string) => Promise<unknown>
  hasDocuments: () => Promise<boolean>
  openWorkspace: (indexPath: string) => Promise<void>
  rebuildIndex: (documents: WorkspaceSearchDocument[]) => Promise<void>
  removeDocument: (path: string) => Promise<void>
  removePathPrefix: (prefix: string) => Promise<void>
  search: (query: string, limit: number) => Promise<FsSearchResult[]>
  shutdown: (reason: string) => Promise<void>
  upsertDocument: (document: WorkspaceSearchDocument) => Promise<void>
}

export type StartedWorkspaceSidecar = {
  address: string
  child?: ChildProcessWithoutNullStreams
  client: WorkspaceSidecarClient
}

export type WorkspaceSidecarRuntime = {
  workspaceId: string
  indexPath: string
  identity: WorkspaceSidecarIdentity
  spawnPlan: WorkspaceSidecarSpawnPlan
  state: WorkspaceSidecarRuntimeState
  openedAt: number
  lastActivityAt: number
  address?: string
  child?: ChildProcessWithoutNullStreams
  client?: WorkspaceSidecarClient
  lastError?: string
}

export type WorkspaceSidecarRuntimeSummary = Omit<
  WorkspaceSidecarRuntime,
  'child' | 'client' | 'identity' | 'spawnPlan'
> & {
  identity: Pick<
    WorkspaceSidecarIdentity,
    'canonicalRoot' | 'engineDataDir' | 'workspaceInstanceId'
  >
  pid?: number
  spawnPlan: ReturnType<typeof redactWorkspaceSidecarSpawnPlan>
}

type WorkspaceSidecarManagerOptions = {
  appDataDir: string
  logger: Logger
  resolveBinary: () => KnowledgeEngineBinaryResolution | null
  startSidecar?: (
    plan: WorkspaceSidecarSpawnPlan,
    identity: WorkspaceSidecarIdentity,
  ) => Promise<StartedWorkspaceSidecar>
}

export class WorkspaceSidecarManager {
  private readonly runtimes = new Map<string, WorkspaceSidecarRuntime>()

  constructor(private readonly options: WorkspaceSidecarManagerOptions) {}

  listActive(): WorkspaceSidecarRuntimeSummary[] {
    return [...this.runtimes.values()].map((runtime) => ({
      address: runtime.address,
      identity: {
        canonicalRoot: runtime.identity.canonicalRoot,
        engineDataDir: runtime.identity.engineDataDir,
        workspaceInstanceId: runtime.identity.workspaceInstanceId,
      },
      indexPath: runtime.indexPath,
      lastActivityAt: runtime.lastActivityAt,
      lastError: runtime.lastError,
      openedAt: runtime.openedAt,
      pid: runtime.child?.pid,
      spawnPlan: redactWorkspaceSidecarSpawnPlan(runtime.spawnPlan),
      state: runtime.state,
      workspaceId: runtime.workspaceId,
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
    const spawnPlan = this.createSpawnPlan(identity)
    const openingRuntime: WorkspaceSidecarRuntime = {
      workspaceId,
      indexPath,
      identity,
      spawnPlan,
      state: 'opening',
      openedAt: now,
      lastActivityAt: now,
    }
    this.runtimes.set(workspaceId, openingRuntime)

    try {
      const started = await this.startSidecar(spawnPlan, identity)
      await started.client.getCapabilities(identity.workspaceInstanceId)
      await started.client.openWorkspace(indexPath)
      this.runtimes.set(workspaceId, {
        ...openingRuntime,
        address: started.address,
        child: started.child,
        client: started.client,
        lastActivityAt: Date.now(),
        state: 'ready',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.runtimes.set(workspaceId, {
        ...openingRuntime,
        lastActivityAt: Date.now(),
        lastError: message,
        state: 'error',
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
      await runtime.client?.closeWorkspace()
      await runtime.client?.shutdown('workspace closed').catch(() => undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.options.logger.warn(
        `[knowledge-engine] Failed to close workspace ${workspaceId}: ${message}`,
      )
    } finally {
      runtime.client?.close()
      if (runtime.child && !runtime.child.killed) {
        runtime.child.kill()
      }
      this.runtimes.delete(workspaceId)
    }
  }

  async hasDocuments(workspaceId: string): Promise<boolean> {
    return this.requireReady(workspaceId).client.hasDocuments()
  }

  async rebuildIndex(workspaceId: string, documents: WorkspaceSearchDocument[]): Promise<void> {
    await this.requireReady(workspaceId).client.rebuildIndex(documents)
  }

  async upsertDocument(workspaceId: string, document: WorkspaceSearchDocument): Promise<void> {
    await this.requireReady(workspaceId).client.upsertDocument(document)
  }

  async removeDocument(workspaceId: string, path: string): Promise<void> {
    await this.requireReady(workspaceId).client.removeDocument(path)
  }

  async removePathPrefix(workspaceId: string, prefix: string): Promise<void> {
    await this.requireReady(workspaceId).client.removePathPrefix(prefix)
  }

  async search(workspaceId: string, query: string, limit: number): Promise<FsSearchResult[]> {
    return this.requireReady(workspaceId).client.search(query, limit)
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.runtimes.keys()].map((workspaceId) => this.close(workspaceId)))
  }

  clear(): void {
    for (const runtime of this.runtimes.values()) {
      runtime.client?.close()
      if (runtime.child && !runtime.child.killed) {
        runtime.child.kill()
      }
    }
    this.runtimes.clear()
  }

  private requireReady(workspaceId: string): WorkspaceSidecarRuntime & {
    client: WorkspaceSidecarClient
  } {
    const runtime = this.runtimes.get(workspaceId)
    if (!runtime?.client || runtime.state !== 'ready') {
      throw new Error(`Knowledge sidecar workspace is not ready: ${workspaceId}`)
    }

    runtime.lastActivityAt = Date.now()
    return runtime as WorkspaceSidecarRuntime & { client: WorkspaceSidecarClient }
  }

  private createSpawnPlan(identity: WorkspaceSidecarIdentity): WorkspaceSidecarSpawnPlan {
    const binary = this.options.resolveBinary()
    if (!binary?.exists) {
      throw new Error('Knowledge engine binary not found. Run pnpm knowledge:build first.')
    }

    return createWorkspaceSidecarSpawnPlan({
      binary,
      identity,
    })
  }

  private startSidecar(
    plan: WorkspaceSidecarSpawnPlan,
    identity: WorkspaceSidecarIdentity,
  ): Promise<StartedWorkspaceSidecar> {
    return this.options.startSidecar
      ? this.options.startSidecar(plan, identity)
      : startGrpcSidecar(plan, identity, this.options.logger)
  }
}

const startGrpcSidecar = async (
  plan: WorkspaceSidecarSpawnPlan,
  identity: WorkspaceSidecarIdentity,
  logger: Logger,
): Promise<StartedWorkspaceSidecar> => {
  const child = spawn(plan.command, plan.args, {
    env: plan.env,
    stdio: 'pipe',
    windowsHide: plan.windowsHide,
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    const message = chunk.trim()
    if (message) logger.warn(`[knowledge-engine] ${message}`)
  })

  const address = await waitForReady(child, identity.workspaceInstanceId)
  const client = new KnowledgeEngineGrpcClient({
    address,
    sessionToken: identity.sessionToken,
  })

  return { address, child, client }
}

const waitForReady = (
  child: ChildProcessWithoutNullStreams,
  workspaceInstanceId: string,
): Promise<string> =>
  new Promise((resolve, reject) => {
    let buffer = ''
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Knowledge sidecar did not become ready in time.'))
    }, SIDECAR_READY_TIMEOUT_MS)

    const cleanup = () => {
      clearTimeout(timeout)
      child.stdout.off('data', onData)
      child.off('error', onError)
      child.off('exit', onExit)
    }

    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup()
      reject(new Error(`Knowledge sidecar exited before ready: code=${code} signal=${signal}`))
    }

    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString()
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        const address = parseReadyAddress(line, workspaceInstanceId)
        if (address) {
          cleanup()
          resolve(address)
          return
        }
        newlineIndex = buffer.indexOf('\n')
      }
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', onData)
    child.once('error', onError)
    child.once('exit', onExit)
  })

const parseReadyAddress = (line: string, workspaceInstanceId: string): string | null => {
  if (!line) return null

  const value = JSON.parse(line) as Record<string, unknown>
  if (
    value.type !== 'READY' ||
    value.protocol !== 'grpc' ||
    value.workspaceInstanceId !== workspaceInstanceId ||
    typeof value.address !== 'string'
  ) {
    return null
  }

  return value.address
}
