import type { Logger } from '@electron/services/logger'
import type { FsGraph } from '@electron/services/workspace/types'
import { WorkspaceGraphCache } from '@electron/services/workspace/workspaceGraphCache'
import { WorkspaceGraphComputationScheduler } from '@electron/services/workspace/workspaceGraphComputationScheduler'
import type { WorkspaceGraphStore } from '@electron/services/workspace/workspaceGraphStore'

type GraphInput = {
  documents: Array<{ path: string; content: string }>
  knownPaths: { paths: string[]; assetPaths: string[] }
}

type ResolveGraphInput = GraphInput & {
  build: () => Promise<FsGraph>
  onStarted?: () => void
  priority: 'background' | 'interactive'
  signal?: AbortSignal
  workspaceKey: string
}

type WorkspaceGraphResolverOptions = {
  logger: Pick<Logger, 'warn'>
  scheduler?: WorkspaceGraphComputationScheduler
  store?: WorkspaceGraphStore
}

export class WorkspaceGraphResolver {
  private readonly cache = new WorkspaceGraphCache()
  private readonly scheduler: WorkspaceGraphComputationScheduler

  constructor(private readonly options: WorkspaceGraphResolverOptions) {
    this.scheduler = options.scheduler ?? new WorkspaceGraphComputationScheduler({ concurrency: 1 })
  }

  async resolve(input: ResolveGraphInput): Promise<FsGraph> {
    const revision = this.cache.createWorkspaceGraphKey(input.documents, input.knownPaths)
    const cached = this.cache.getWorkspaceGraphByKey(revision)
    if (cached) return withRevision(cached, revision)

    const stored = await this.readStored(input.workspaceKey, revision)
    if (stored) {
      this.cache.setWorkspaceGraphByKey(revision, stored)
      return withRevision(stored, revision)
    }

    const graph = await this.scheduler.run({
      priority: input.priority,
      revision,
      onStarted: input.onStarted,
      signal: input.signal,
      task: input.build,
      workspaceKey: input.workspaceKey,
    })
    this.cache.setWorkspaceGraphByKey(revision, graph)
    if (this.scheduler.isCurrent(input.workspaceKey, revision)) {
      await this.store(input.workspaceKey, revision, graph)
    }
    return withRevision(graph, revision)
  }

  clear(): void {
    this.cache.clear()
  }

  private async readStored(workspaceKey: string, revision: string): Promise<FsGraph | undefined> {
    if (!this.options.store) return undefined
    try {
      return await this.options.store.get(workspaceKey, revision)
    } catch (error) {
      this.options.logger.warn('workspace graph cache read failed', { error, workspaceKey })
      return undefined
    }
  }

  private async store(workspaceKey: string, revision: string, graph: FsGraph): Promise<void> {
    if (!this.options.store) return
    try {
      await this.options.store.save(workspaceKey, revision, graph)
    } catch (error) {
      this.options.logger.warn('workspace graph cache write failed', { error, workspaceKey })
    }
  }
}

const withRevision = (graph: FsGraph, revision: string): FsGraph => {
  return graph.revision === revision ? graph : { ...graph, revision }
}
