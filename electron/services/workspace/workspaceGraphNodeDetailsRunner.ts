import type { Logger } from '@electron/services/logger'
import type { WorkspaceAnalysisScheduler } from '@electron/services/workspace/workspaceAnalysisConcurrency'
import { WorkspaceAnalysisWorkerClient } from '@electron/services/workspace/workspaceAnalysisWorkerClient'
import type {
  WorkspaceGraphNodeDetailsTask,
  WorkspaceGraphNodeDetailsWorkerResult,
} from '@electron/services/workspace/workspaceAnalysisWorkerMessages'

export class WorkspaceGraphNodeDetailsRunner {
  private readonly worker: WorkspaceAnalysisWorkerClient
  private active: AbortController | null = null

  constructor(
    logger: Logger,
    private readonly scheduler: WorkspaceAnalysisScheduler,
  ) {
    this.worker = new WorkspaceAnalysisWorkerClient(logger)
  }

  run(task: WorkspaceGraphNodeDetailsTask): Promise<WorkspaceGraphNodeDetailsWorkerResult> {
    this.active?.abort()
    const controller = new AbortController()
    this.active = controller
    return this.scheduler
      .run(
        () => this.worker.runLatest<WorkspaceGraphNodeDetailsWorkerResult>(task),
        controller.signal,
      )
      .finally(() => {
        if (this.active === controller) this.active = null
      })
  }

  dispose(): void {
    this.active?.abort()
    this.active = null
    this.worker.terminate()
  }
}
