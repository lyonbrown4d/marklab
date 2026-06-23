import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { App } from 'electron'

import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke.js'
import { resolveKnowledgeEngineBinary } from '@electron/services/knowledgeEngine/binaryPath.js'
import { KnowledgeEngineRpcClient } from '@electron/services/knowledgeEngine/rpcClient.js'
import type {
  KnowledgeEngineInitializeResult,
  KnowledgeEngineStatus,
} from '@electron/services/knowledgeEngine/types.js'
import { WorkspaceSidecarManager } from '@electron/services/knowledgeEngine/workspaceSidecarManager.js'
import type { Logger } from '@electron/services/logger.js'

type KnowledgeEngineServiceOptions = {
  app: App
  logger: Logger
}

export class KnowledgeEngineService {
  private child: ChildProcessWithoutNullStreams | null = null
  private client: KnowledgeEngineRpcClient | null = null
  private state: KnowledgeEngineStatus['state'] = 'stopped'
  private lastError: string | undefined
  private readonly sidecars: WorkspaceSidecarManager

  constructor(private readonly options: KnowledgeEngineServiceOptions) {
    this.sidecars = new WorkspaceSidecarManager({
      logger: this.options.logger,
      transport: {
        getStatus: () => this.getStatus(),
        initialize: () => this.initialize(),
        request: (method, params) => this.request(method, params),
      },
    })
  }

  get commandHandlers(): NativeCommandHandlers {
    return {
      'knowledge.engine.status': () => this.getStatus(),
      'knowledge.engine.initialize': () => this.initialize(),
      'knowledge.engine.stop': () => this.stop(),
      'knowledge.engine.workspaces': () => this.sidecars.listActive(),
    }
  }

  getStatus(): KnowledgeEngineStatus {
    const binary = resolveKnowledgeEngineBinary(this.options.app)
    const activeState = binary?.exists ? this.state : 'missing'

    return {
      state: activeState,
      binaryPath: binary?.binaryPath ?? null,
      ...(this.child?.pid ? { pid: this.child.pid } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
    }
  }

  async initialize(): Promise<KnowledgeEngineInitializeResult> {
    const startStatus = this.start()
    if (startStatus.state === 'missing' || startStatus.state === 'error') {
      return {
        ok: false,
        status: startStatus,
        error: startStatus.lastError ?? 'Knowledge engine binary is not available.',
      }
    }

    try {
      const response = await this.client?.request('initialize')
      this.state = 'ready'

      return {
        ok: true,
        status: this.getStatus(),
        response,
      }
    } catch (error) {
      this.state = 'error'
      this.lastError = error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        status: this.getStatus(),
        error: this.lastError,
      }
    }
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const status = this.start()
    if (status.state === 'missing' || status.state === 'error') {
      throw new Error(status.lastError ?? 'Knowledge engine is not available.')
    }
    if (!this.client) {
      throw new Error('Knowledge engine transport is not available.')
    }

    return this.client.request(method, params)
  }

  async openWorkspace(workspaceId: string, indexPath: string): Promise<void> {
    await this.sidecars.open(workspaceId, indexPath)
  }

  async closeWorkspace(workspaceId: string): Promise<void> {
    await this.sidecars.close(workspaceId)
  }

  async requestWorkspace(
    workspaceId: string,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.sidecars.request(workspaceId, method, params)
  }

  stop(): KnowledgeEngineStatus {
    this.sidecars.clear()
    this.client?.dispose()
    this.client = null

    if (this.child && !this.child.killed) {
      this.child.kill()
    }

    this.child = null
    this.state = 'stopped'
    return this.getStatus()
  }

  dispose() {
    this.stop()
  }

  private start(): KnowledgeEngineStatus {
    if (this.child && !this.child.killed && this.client) {
      return this.getStatus()
    }

    const binary = resolveKnowledgeEngineBinary(this.options.app)
    if (!binary?.exists) {
      this.state = 'missing'
      this.lastError = 'Knowledge engine binary not found. Run pnpm knowledge:build first.'
      return this.getStatus()
    }

    try {
      this.state = 'starting'
      this.child = spawn(binary.binaryPath, [], {
        stdio: 'pipe',
        windowsHide: true,
      })
      this.client = new KnowledgeEngineRpcClient(this.child, this.options.logger)
      this.child.once('exit', (code, signal) => {
        this.state = 'exited'
        this.child = null
        this.client = null
        this.options.logger.info(
          `[knowledge-engine] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`,
        )
      })
      this.state = 'ready'
      this.lastError = undefined
    } catch (error) {
      this.state = 'error'
      this.lastError = error instanceof Error ? error.message : String(error)
    }

    return this.getStatus()
  }
}
