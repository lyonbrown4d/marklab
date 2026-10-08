import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { Logger } from '@electron/services/logger'
import type { FsGraph, FsStateData } from '@electron/services/workspace/types'
import type {
  WorkspaceAnalysisCache,
  WorkspaceAnalysisInput,
} from '@electron/services/workspace/workspaceAnalysisCache'
import { createWorkspaceStorageKey } from '@electron/services/workspace/workspaceIdentity'
import type { WorkspaceGraphResolver } from '@electron/services/workspace/workspaceGraphResolver'
import { trySidecarWorkspaceGraph } from '@electron/services/workspace/workspaceSidecarFileBridge'
import {
  parseWorkspaceGraphNodeDetailsQuery,
  selectWorkspaceGraphNodeDocuments,
} from '@electron/services/knowledgeEngine/workspaceGraphNodeDetails'
import type {
  WorkspaceGraphNodeDetailsTask,
  WorkspaceGraphNodeDetailsWorkerResult,
} from '@electron/services/workspace/workspaceAnalysisWorkerMessages'
import { graphTopologyOnly } from '@electron/services/knowledgeEngine/workspaceGraphTopology'

type WorkspaceGraphQueryServiceOptions = {
  analysisCache: WorkspaceAnalysisCache
  getInput: () => Promise<WorkspaceAnalysisInput>
  getState: () => FsStateData
  graphResolver: WorkspaceGraphResolver
  knowledgeEngineService?: KnowledgeEngineService
  logger: Logger
  runNodeDetails: (
    task: WorkspaceGraphNodeDetailsTask,
  ) => Promise<WorkspaceGraphNodeDetailsWorkerResult>
}

export class WorkspaceGraphQueryService {
  constructor(private readonly options: WorkspaceGraphQueryServiceOptions) {}

  async load(
    priority: 'background' | 'interactive',
    options: { onStarted?: () => void; signal?: AbortSignal } = {},
  ): Promise<FsGraph> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      options.signal?.throwIfAborted()
      const revision = this.options.analysisCache.revision
      const graph = await this.loadRevision(priority, options)
      if (revision === this.options.analysisCache.revision) return graphTopologyOnly(graph)
    }
    throw new Error('Workspace analysis changed while the graph query was running')
  }

  async loadNodeDetails(value: unknown) {
    const query = parseWorkspaceGraphNodeDetailsQuery(value)
    const graph = await this.load('interactive')
    if (graph.revision !== query.revision) throw new Error('Workspace graph revision is stale')
    const generation = this.options.analysisCache.revision
    const { documents } = await this.options.getInput()
    const { revision, ...selection } = query
    const result = await this.options.runNodeDetails({
      type: 'workspace-graph-node-details',
      documents: selectWorkspaceGraphNodeDocuments(documents, selection),
      query: selection,
      revision,
    })
    if (generation !== this.options.analysisCache.revision || result.revision !== query.revision) {
      throw new Error('Workspace graph node details result is stale')
    }
    return result
  }

  private loadRevision(
    priority: 'background' | 'interactive',
    options: { onStarted?: () => void; signal?: AbortSignal },
  ): Promise<FsGraph> {
    const resolve = async () => {
      options.signal?.throwIfAborted()
      const state = this.options.getState()
      const workspaceKey = createWorkspaceStorageKey({ kind: state.rootKind, path: state.rootPath })
      const { documents, knownPaths } = await this.options.getInput()
      options.signal?.throwIfAborted()
      return this.options.graphResolver.resolve({
        build: () =>
          trySidecarWorkspaceGraph({
            documents,
            knowledgeEngineService: this.options.knowledgeEngineService,
            knownPaths,
            logger: this.options.logger,
            state,
          }),
        documents,
        knownPaths,
        onStarted: options.onStarted,
        priority,
        signal: options.signal,
        workspaceKey,
      })
    }
    return priority === 'interactive' ? this.options.analysisCache.getGraph(resolve) : resolve()
  }
}
