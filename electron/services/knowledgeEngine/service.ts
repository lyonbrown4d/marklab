import type { App } from 'electron'

import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke'
import { createKnowledgeEngineCommandHandlers } from '@electron/services/knowledgeEngine/knowledgeEngineCommandHandlers'
import { KnowledgeEngineRuntime } from '@electron/services/knowledgeEngine/knowledgeEngineRuntime'
import { KnowledgeEngineWorkspaceFacade } from '@electron/services/knowledgeEngine/knowledgeEngineWorkspaceFacade'
import type {
  KnowledgeEngineInitializeResult,
  KnowledgeEngineStatus,
} from '@electron/services/knowledgeEngine/types'
import type { WorkspaceSidecarRuntimeSummary } from '@electron/services/knowledgeEngine/workspaceSidecarTypes'
import type { Logger } from '@electron/services/logger'
import type { WorkspaceAnalysisScheduler } from '@electron/services/workspace/workspaceAnalysisConcurrency'

type KnowledgeEngineServiceOptions = {
  app: App
  logger: Logger
  workspaceAnalysisScheduler?: WorkspaceAnalysisScheduler
}

export class KnowledgeEngineService extends KnowledgeEngineWorkspaceFacade {
  private readonly runtimeController: KnowledgeEngineRuntime

  constructor(options: KnowledgeEngineServiceOptions) {
    const runtime = new KnowledgeEngineRuntime(options)
    super(runtime, options.workspaceAnalysisScheduler)
    this.runtimeController = runtime
  }

  get commandHandlers(): NativeCommandHandlers {
    return createKnowledgeEngineCommandHandlers(this)
  }

  getStatus(): KnowledgeEngineStatus {
    return this.runtimeController.status()
  }

  initialize(): Promise<KnowledgeEngineInitializeResult> {
    return this.runtimeController.initialize()
  }

  async listWorkspaces(): Promise<WorkspaceSidecarRuntimeSummary[]> {
    return (await this.runtimeController.sidecars()).listActive()
  }

  stop(): KnowledgeEngineStatus {
    return this.runtimeController.stop()
  }

  dispose(): void {
    this.stop()
  }
}
