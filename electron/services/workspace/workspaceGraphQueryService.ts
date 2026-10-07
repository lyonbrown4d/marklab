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

type WorkspaceGraphQueryServiceOptions = {
  analysisCache: WorkspaceAnalysisCache
  getInput: () => Promise<WorkspaceAnalysisInput>
  getState: () => FsStateData
  graphResolver: WorkspaceGraphResolver
  knowledgeEngineService?: KnowledgeEngineService
  logger: Logger
}

export class WorkspaceGraphQueryService {
  constructor(private readonly options: WorkspaceGraphQueryServiceOptions) {}

  async load(priority: 'background' | 'interactive'): Promise<FsGraph> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const revision = this.options.analysisCache.revision
      const graph = await this.loadRevision(priority)
      if (revision === this.options.analysisCache.revision) return graph
    }
    throw new Error('Workspace analysis changed while the graph query was running')
  }

  private loadRevision(priority: 'background' | 'interactive'): Promise<FsGraph> {
    const resolve = async () => {
      const state = this.options.getState()
      const workspaceKey = createWorkspaceStorageKey({ kind: state.rootKind, path: state.rootPath })
      const { documents, knownPaths } = await this.options.getInput()
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
        priority,
        workspaceKey,
      })
    }
    return priority === 'interactive' ? this.options.analysisCache.getGraph(resolve) : resolve()
  }
}
