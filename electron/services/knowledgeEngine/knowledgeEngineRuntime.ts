import type { App } from 'electron'

import {
  getKnowledgeEngineStatus,
  initializeKnowledgeEngine,
} from '@electron/services/knowledgeEngine/knowledgeEngineStatus'
import type { WorkspaceSidecarManager } from '@electron/services/knowledgeEngine/workspaceSidecarManager'
import type {
  KnowledgeEngineInitializeResult,
  KnowledgeEngineStatus,
} from '@electron/services/knowledgeEngine/types'
import type { Logger } from '@electron/services/logger'

type KnowledgeEngineRuntimeOptions = {
  app: App
  logger: Logger
}

export class KnowledgeEngineRuntime {
  private manager: WorkspaceSidecarManager | null = null

  constructor(private readonly options: KnowledgeEngineRuntimeOptions) {}

  status(): KnowledgeEngineStatus {
    return getKnowledgeEngineStatus(this.manager?.listActive() ?? [])
  }

  initialize(): Promise<KnowledgeEngineInitializeResult> {
    return Promise.resolve(initializeKnowledgeEngine(this.status()))
  }

  async sidecars(): Promise<WorkspaceSidecarManager> {
    if (this.manager) return this.manager
    const { createWorkspaceSidecarManager } =
      await import('@electron/services/knowledgeEngine/workspaceSidecarManagerFactory')
    this.manager = createWorkspaceSidecarManager({
      appDataDir: this.options.app.getPath('userData'),
      logger: this.options.logger,
    })
    return this.manager
  }

  stop(): KnowledgeEngineStatus {
    this.manager?.clear()
    return this.status()
  }
}
