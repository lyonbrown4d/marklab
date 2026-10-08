import type { Logger } from '@electron/services/logger'
import { WorkspaceGraphPrecomputeCoordinator } from '@electron/services/workspace/workspaceGraphPrecomputeCoordinator'
import { WorkspaceIndexPrewarmer } from '@electron/services/workspace/workspaceIndexPrewarmer'

type WorkspaceAnalysisPrewarmLifecycleOptions = {
  canPrecomputeGraph: () => boolean
  graphDelayMs: number
  indexDelayMs: number
  logger: Logger
  precomputeGraph: (context: { markStarted: () => void; signal: AbortSignal }) => Promise<void>
  precomputeIndex: () => Promise<unknown>
  setGraphStatus: (status: 'error' | 'idle' | 'running', message: string | null) => void
}

export class WorkspaceAnalysisPrewarmLifecycle {
  private rendererInteractive = false
  private readonly graph: WorkspaceGraphPrecomputeCoordinator
  private readonly index: WorkspaceIndexPrewarmer

  constructor(private readonly options: WorkspaceAnalysisPrewarmLifecycleOptions) {
    this.graph = new WorkspaceGraphPrecomputeCoordinator({
      delayMs: options.graphDelayMs,
      logger: options.logger,
      run: options.precomputeGraph,
      setStatus: options.setGraphStatus,
    })
    this.index = new WorkspaceIndexPrewarmer({
      delayMs: options.indexDelayMs,
      logger: options.logger,
      run: options.precomputeIndex,
    })
  }

  beginRendererHydration = (): void => {
    this.rendererInteractive = false
    this.index.cancel()
    this.graph.cancel()
  }

  markRendererInteractive = (): void => {
    if (this.rendererInteractive) return
    this.rendererInteractive = true
    this.index.schedule()
    this.scheduleGraph()
  }

  scheduleGraph(): void {
    if (this.rendererInteractive && this.options.canPrecomputeGraph()) {
      this.graph.schedule()
    }
  }

  dispose(): void {
    this.index.dispose()
    this.graph.dispose()
  }
}
