import type { Logger } from '@electron/services/logger'
import { WorkspaceGraphPrecomputeCoordinator } from '@electron/services/workspace/workspaceGraphPrecomputeCoordinator'
import { WorkspaceIndexPrewarmer } from '@electron/services/workspace/workspaceIndexPrewarmer'

type WorkspaceAnalysisPrewarmLifecycleOptions = {
  canPrecomputeGraph: () => boolean
  graphDelayMs: number
  indexDelayMs: number
  logger: Pick<Logger, 'warn'>
  precomputeGraph: (context: { markStarted: () => void; signal: AbortSignal }) => Promise<void>
  precomputeIndex: () => Promise<unknown>
  setGraphStatus: (status: 'error' | 'idle' | 'running', message: string | null) => void
}

export class WorkspaceAnalysisPrewarmLifecycle {
  private rendererInteractive = false
  private windowForeground = true
  private graphDemanded = false
  private graphRevision = 0
  private graphWarmRevision = -1
  private indexRevision = 0
  private indexWarmRevision = -1
  private readonly graph: WorkspaceGraphPrecomputeCoordinator
  private readonly index: WorkspaceIndexPrewarmer

  constructor(private readonly options: WorkspaceAnalysisPrewarmLifecycleOptions) {
    this.graph = new WorkspaceGraphPrecomputeCoordinator({
      delayMs: options.graphDelayMs,
      logger: options.logger,
      run: async (context) => {
        if (!this.canPrewarm() || this.graphWarmRevision === this.graphRevision) return
        const revision = this.graphRevision
        await options.precomputeGraph(context)
        this.markGraphLoaded(revision)
      },
      setStatus: options.setGraphStatus,
    })
    this.index = new WorkspaceIndexPrewarmer({
      delayMs: options.indexDelayMs,
      logger: options.logger,
      run: async () => {
        if (!this.canPrewarm() || this.indexWarmRevision === this.indexRevision) return
        const revision = this.indexRevision
        await options.precomputeIndex()
        if (revision === this.indexRevision) this.indexWarmRevision = revision
      },
    })
  }

  beginRendererHydration = (): void => {
    this.rendererInteractive = false
    this.indexRevision += 1
    this.index.cancel()
    this.graph.cancel()
  }

  markRendererInteractive = (): void => {
    if (this.rendererInteractive) return
    this.rendererInteractive = true
    this.resume()
  }

  setWindowForeground = (foreground: boolean): void => {
    if (this.windowForeground === foreground) return
    this.windowForeground = foreground
    if (foreground) this.resume()
    else {
      this.index.cancel()
      this.graph.cancel()
    }
  }

  resetWorkspace = (): void => {
    this.graphDemanded = false
    this.graphRevision += 1
    this.beginRendererHydration()
  }

  markGraphRequested = (): number => {
    this.graphDemanded = true
    return this.graphRevision
  }

  markGraphLoaded = (revision: number): void => {
    if (revision === this.graphRevision) this.graphWarmRevision = revision
  }

  scheduleGraph(): void {
    this.graphRevision += 1
    this.scheduleStaleGraph()
  }

  private canPrewarm = (): boolean => this.rendererInteractive && this.windowForeground

  private resume = (): void => {
    if (!this.canPrewarm()) return
    if (this.indexWarmRevision !== this.indexRevision) this.index.schedule()
    this.scheduleStaleGraph()
  }

  private scheduleStaleGraph = (): void => {
    if (
      this.canPrewarm() &&
      this.graphDemanded &&
      this.graphWarmRevision !== this.graphRevision &&
      this.options.canPrecomputeGraph()
    )
      this.graph.schedule()
  }

  dispose(): void {
    this.index.dispose()
    this.graph.dispose()
  }
}
