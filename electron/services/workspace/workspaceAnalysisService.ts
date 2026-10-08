import type { App, Shell } from 'electron'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import { noopLogger, type Logger } from '@electron/services/logger'
import type { FsGraph, FsRootInfo, FsWorkspaceIndex } from '@electron/services/workspace/types'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService'
import { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex'
import { workspaceSearchKey } from '@electron/services/workspace/workspaceSearchIndexLifecycle'
import { WorkspaceGraphResolver } from '@electron/services/workspace/workspaceGraphResolver'
import { WorkspaceAnalysisCache } from '@electron/services/workspace/workspaceAnalysisCache'
import { WorkspaceAnalysisWorkerClient } from '@electron/services/workspace/workspaceAnalysisWorkerClient'
import { analyzeWorkspaceMarkdownBuffer } from '@electron/services/workspace/workspaceMarkdownAnalysis'
import type { WatchEventName } from '@electron/services/workspace/workspaceUtils'
import { WorkspaceIndexQueryService } from '@electron/services/workspace/workspaceIndexQueryService'
import { WorkspaceGraphQueryService } from '@electron/services/workspace/workspaceGraphQueryService'
import { WorkspaceGraphNodeDetailsRunner } from '@electron/services/workspace/workspaceGraphNodeDetailsRunner'
import { WorkspaceAnalysisScheduler } from '@electron/services/workspace/workspaceAnalysisConcurrency'
import { WorkspaceAnalysisPrewarmLifecycle } from '@electron/services/workspace/workspaceAnalysisPrewarmLifecycle'
import { WorkspaceSearchIndexRuntime } from '@electron/services/workspace/workspaceSearchIndexRuntime'
import type {
  WorkspaceAnalysisServiceOptions,
  WorkspaceSearchIndexFactory,
} from '@electron/services/workspace/workspaceAnalysisServiceTypes'

export class WorkspaceAnalysisService extends WorkspaceFileService {
  constructor(
    app: App,
    shell: Shell,
    logger: Logger = noopLogger,
    localHistoryService: LocalHistoryServiceContract,
    workspaceSearchIndexFactory: WorkspaceSearchIndexFactory = () => new WorkspaceSearchIndex(),
    private readonly analysisKnowledgeEngineService?: KnowledgeEngineService,
    private readonly options: WorkspaceAnalysisServiceOptions = {},
  ) {
    super(app, shell, logger, localHistoryService, analysisKnowledgeEngineService)
    this.analysisScheduler =
      this.options.workspaceAnalysisScheduler ?? new WorkspaceAnalysisScheduler()
    this.graphDetailsRunner = new WorkspaceGraphNodeDetailsRunner(
      this.logger.child('graph-details-worker'),
      this.analysisScheduler,
    )
    this.workspaceSearchIndex = workspaceSearchIndexFactory()
    this.graphResolver = new WorkspaceGraphResolver({
      logger: this.logger,
      scheduler: this.options.workspaceGraphScheduler,
      store: this.options.workspaceGraphStore,
    })
    this.graphQueries = new WorkspaceGraphQueryService({
      analysisCache: this.analysisCache,
      getInput: () => this.getWorkspaceAnalysisInput(),
      getNodeDocuments: (paths) => this.documents.documentsForPaths(paths),
      getState: () => ({ ...this.state }),
      graphResolver: this.graphResolver,
      knowledgeEngineService: this.analysisKnowledgeEngineService,
      logger: this.logger,
      runNodeDetails: (task) => this.graphDetailsRunner.run(task),
    })
    this.searchIndex = new WorkspaceSearchIndexRuntime({
      getState: () => this.state,
      getUserDataPath: () => this.app.getPath('userData'),
      index: this.workspaceSearchIndex,
      loadDocuments: (signal) => this.loadSearchDocuments(signal),
      logger: this.logger,
      readFile: (path) => this.readFileForAnalysis(path),
      runTask: (work, name) => this.runSearchIndexTask(work, name),
    })
    this.analysisPrewarm = new WorkspaceAnalysisPrewarmLifecycle({
      canPrecomputeGraph: () =>
        Boolean(this.analysisKnowledgeEngineService) && this.state.rootKind !== 'single',
      graphDelayMs: this.options.graphPrecomputeDelayMs ?? 750,
      indexDelayMs: this.options.workspaceIndexPrecomputeDelayMs ?? 100,
      logger: this.logger,
      precomputeGraph: ({ markStarted, signal }) =>
        this.graphQueries
          .load('background', { onStarted: markStarted, signal })
          .then(() => undefined),
      precomputeIndex: () => this.workspaceIndex(),
      setGraphStatus: (status, message) =>
        this.setTask('workspace-graph', 'Workspace graph', status, message),
    })
  }

  private readonly analysisWorker = new WorkspaceAnalysisWorkerClient(
    this.logger.child('analysis-worker'),
  )
  private readonly analysisScheduler: WorkspaceAnalysisScheduler
  private readonly graphDetailsRunner: WorkspaceGraphNodeDetailsRunner
  private readonly workspaceSearchIndex: WorkspaceSearchIndex
  private readonly searchIndex: WorkspaceSearchIndexRuntime
  private readonly graphResolver: WorkspaceGraphResolver
  private readonly graphQueries: WorkspaceGraphQueryService
  private readonly analysisPrewarm: WorkspaceAnalysisPrewarmLifecycle
  private readonly analysisCache = new WorkspaceAnalysisCache()
  private readonly loadSearchDocuments = (signal?: AbortSignal) =>
    signal ? this.documents.documents(undefined, undefined, signal) : this.workspaceDocuments()
  private readonly indexQuery = new WorkspaceIndexQueryService({
    getRevision: () => this.analysisCache.revision,
    load: () => this.workspaceIndex(),
  })
  readonly workspacePageQuery = this.indexQuery.workspacePageQuery.bind(this.indexQuery)
  readonly workspaceNavigationQuery = this.indexQuery.workspaceNavigationQuery.bind(this.indexQuery)
  readonly workspaceDocumentInsights = this.indexQuery.workspaceDocumentInsights.bind(
    this.indexQuery,
  )
  readonly workspaceKnowledgeSummary = this.indexQuery.workspaceKnowledgeSummary.bind(
    this.indexQuery,
  )
  workspaceGraphNodeDetails(value: unknown) {
    return this.graphQueries.loadNodeDetails(value)
  }
  beginRendererHydration(): void {
    this.analysisPrewarm.beginRendererHydration()
  }

  markRendererInteractive(): void {
    if (!this.disposed) this.analysisPrewarm.markRendererInteractive()
  }

  override dispose(): void {
    this.analysisPrewarm.dispose()
    this.searchIndex.dispose()
    this.analysisCache.invalidate()
    this.graphResolver.clear()
    this.analysisWorker.terminate()
    this.graphDetailsRunner.dispose()
    super.dispose()
  }

  async workspaceIndex(): Promise<FsWorkspaceIndex> {
    return this.analysisCache.getIndex(() =>
      this.runSearchIndexTask(async () => {
        const { documents, knownPaths } = await this.getWorkspaceAnalysisInput()
        return this.runWorkerTask(
          () =>
            this.analysisScheduler.run(() =>
              this.analysisWorker.run<FsWorkspaceIndex>({
                type: 'workspace-index',
                documents,
                knownPaths,
              }),
            ),
          'workspace-index',
        )
      }, 'workspace-index'),
    )
  }

  async workspaceGraph(): Promise<FsGraph> {
    return this.graphQueries.load('interactive')
  }

  override updateBuffer(value: unknown): ReturnType<WorkspaceFileService['updateBuffer']> {
    const status = super.updateBuffer(value)
    this.analysisCache.invalidate()
    return status
  }

  analyzeMarkdownBuffer(value: unknown) {
    return analyzeWorkspaceMarkdownBuffer({
      knowledgeEngineService: this.analysisKnowledgeEngineService,
      loadInput: (path, content) => this.workspaceDocumentsAndKnownPaths(path, content),
      logger: this.logger,
      runLocalTask: (work) =>
        this.runWorkerTask(() => this.analysisScheduler.run(work), 'markdown-diagnostics'),
      state: this.state,
      value,
      worker: this.analysisWorker,
    })
  }

  searchWorkspace(value: unknown) {
    return this.searchIndex.search(value)
  }

  searchWorkspaceOccurrences(value: unknown) {
    return this.searchIndex.searchOccurrences(value)
  }

  cancelWorkspaceOccurrenceSearch(value: unknown) {
    return this.searchIndex.cancelOccurrenceSearch(value)
  }

  async rebuildSearchIndex(): Promise<void> {
    await this.searchIndex.rebuild()
  }

  override async setRoot(value: unknown): Promise<FsRootInfo> {
    const previousWorkspaceSearchKey = workspaceSearchKey(this.state)
    const result = await super.setRoot(value)
    if (workspaceSearchKey(this.state) === previousWorkspaceSearchKey) return result
    this.beginRendererHydration()
    this.searchIndex.reset()
    this.analysisCache.invalidate()
    this.graphResolver.clear()
    return result
  }

  override async setSingleFile(value: unknown): Promise<FsRootInfo> {
    const previousWorkspaceSearchKey = workspaceSearchKey(this.state)
    const result = await super.setSingleFile(value)
    if (workspaceSearchKey(this.state) === previousWorkspaceSearchKey) return result
    this.beginRendererHydration()
    this.searchIndex.reset()
    this.analysisCache.invalidate()
    this.graphResolver.clear()
    return result
  }

  protected onWorkspacePathChanged(_changedPath: string | null, event?: WatchEventName): void {
    this.analysisCache.invalidate()
    this.analysisPrewarm.scheduleGraph()
    this.searchIndex.onWorkspacePathChanged(_changedPath, event)
  }

  protected override onBuffersFlushed(relativePaths: string[]): void {
    if (relativePaths.length > 0) {
      this.analysisCache.invalidate()
      this.analysisPrewarm.scheduleGraph()
    }
    this.searchIndex.onBuffersFlushed(relativePaths)
  }

  private readonly getWorkspaceAnalysisInput = () =>
    this.analysisCache.getInput(() => this.workspaceDocumentsAndKnownPaths())
}
