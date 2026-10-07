import type { App, Shell } from 'electron'

import { isSearchIndexablePath } from '@electron/services/workspace/path'
import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import { noopLogger, type Logger } from '@electron/services/logger'
import type { FsGraph, FsRootInfo, FsWorkspaceIndex } from '@electron/services/workspace/types'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService'
import { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex'
import { WorkspaceSearchIndexBuildCoordinator } from '@electron/services/workspace/workspaceSearchIndexBuildCoordinator'
import {
  workspaceChangeAffectsSearch,
  workspaceSearchIndexPath,
  workspaceSearchKey,
} from '@electron/services/workspace/workspaceSearchIndexLifecycle'
import { WorkspaceSearchIndexUpdateQueue } from '@electron/services/workspace/workspaceSearchIndexUpdateQueue'
import { loadWorkspaceSearchDocuments } from '@electron/services/workspace/workspaceSearchDocumentLoader'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'
import { WorkspaceSearchOperations } from '@electron/services/workspace/workspaceSearchOperations'
import { WorkspaceGraphPrecomputeCoordinator } from '@electron/services/workspace/workspaceGraphPrecomputeCoordinator'
import { WorkspaceGraphResolver } from '@electron/services/workspace/workspaceGraphResolver'
import { WorkspaceAnalysisCache } from '@electron/services/workspace/workspaceAnalysisCache'
import { WorkspaceAnalysisWorkerClient } from '@electron/services/workspace/workspaceAnalysisWorkerClient'
import { analyzeWorkspaceMarkdownBuffer } from '@electron/services/workspace/workspaceMarkdownAnalysis'
import type { WatchEventName } from '@electron/services/workspace/workspaceUtils'
import { WorkspaceIndexPrewarmer } from '@electron/services/workspace/workspaceIndexPrewarmer'
import { WorkspaceIndexQueryService } from '@electron/services/workspace/workspaceIndexQueryService'
import { WorkspaceGraphQueryService } from '@electron/services/workspace/workspaceGraphQueryService'
import { WorkspaceGraphNodeDetailsRunner } from '@electron/services/workspace/workspaceGraphNodeDetailsRunner'
import { WorkspaceAnalysisScheduler } from '@electron/services/workspace/workspaceAnalysisConcurrency'
import { rebuildWorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndexBuilder'
import type {
  WorkspaceAnalysisServiceOptions,
  WorkspaceSearchIndexFactory,
} from '@electron/services/workspace/workspaceAnalysisServiceTypes'

const SEARCH_INDEX_REBUILD_DELAY_MS = 600

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
      getState: () => ({ ...this.state }),
      graphResolver: this.graphResolver,
      knowledgeEngineService: this.analysisKnowledgeEngineService,
      logger: this.logger,
      runNodeDetails: (task) => this.graphDetailsRunner.run(task),
    })
    this.searchOperations = new WorkspaceSearchOperations({
      activeSearchKey: () => this.activeWorkspaceSearchKey,
      index: this.workspaceSearchIndex,
      logger: this.logger,
      prepare: () => this.prepareWorkspaceSearchIndex(),
      runTask: (work, name) => this.runSearchIndexTask(work, name),
    })
    this.graphPrecompute = new WorkspaceGraphPrecomputeCoordinator({
      delayMs: this.options.graphPrecomputeDelayMs ?? 750,
      logger: this.logger,
      run: () => this.graphQueries.load('background').then(() => undefined),
      setStatus: (status, message) =>
        this.setTask('workspace-graph', 'Workspace graph', status, message),
    })
    this.indexPrewarmer = new WorkspaceIndexPrewarmer({
      delayMs: this.options.workspaceIndexPrecomputeDelayMs ?? 100,
      logger: this.logger,
      run: () => this.workspaceIndex(),
    })
    this.indexPrewarmer.schedule()
  }

  private readonly analysisWorker = new WorkspaceAnalysisWorkerClient(
    this.logger.child('analysis-worker'),
  )
  private readonly analysisScheduler: WorkspaceAnalysisScheduler
  private readonly graphDetailsRunner: WorkspaceGraphNodeDetailsRunner
  private readonly workspaceSearchIndex: WorkspaceSearchIndex
  private readonly searchOperations: WorkspaceSearchOperations
  private readonly graphResolver: WorkspaceGraphResolver
  private readonly graphQueries: WorkspaceGraphQueryService
  private readonly graphPrecompute: WorkspaceGraphPrecomputeCoordinator
  private readonly indexPrewarmer: WorkspaceIndexPrewarmer
  private readonly analysisCache = new WorkspaceAnalysisCache()
  private readonly indexQueries = new WorkspaceIndexQueryService({
    getRevision: () => this.analysisCache.revision,
    load: () => this.workspaceIndex(),
  })
  readonly workspacePageQuery = this.indexQueries.workspacePageQuery.bind(this.indexQueries)
  readonly workspaceNavigationQuery = this.indexQueries.workspaceNavigationQuery.bind(
    this.indexQueries,
  )
  readonly workspaceDocumentInsights = this.indexQueries.workspaceDocumentInsights.bind(
    this.indexQueries,
  )
  readonly workspaceKnowledgeSummary = this.indexQueries.workspaceKnowledgeSummary.bind(
    this.indexQueries,
  )
  workspaceGraphNodeDetails(value: unknown) {
    return this.graphQueries.loadNodeDetails(value)
  }
  private readonly searchIndexUpdateQueue =
    new WorkspaceSearchIndexUpdateQueue<WorkspaceSearchDocument>({
      applyChanges: (changes) => this.workspaceSearchIndex.applySearchChanges(changes),
      delayMs: SEARCH_INDEX_REBUILD_DELAY_MS,
      getDocumentPath: (document) => document.path,
      loadDocuments: (paths) =>
        loadWorkspaceSearchDocuments({
          concurrency: 8,
          logger: this.logger,
          paths,
          readFile: (path) => this.readFile({ path }),
        }),
      logger: this.logger.child('search-index-updates'),
      openIndex: () => this.openWorkspaceSearchIndex(),
      rebuildAll: async () => {
        if (await this.buildSearchIndexFromWorkspace()) {
          this.needsSearchIndexRebuild = false
        }
      },
      runTask: (work, taskName) => this.runSearchIndexTask(work, taskName),
    })
  private activeWorkspaceSearchKey = ''
  private readonly searchIndexBuildCoordinator = new WorkspaceSearchIndexBuildCoordinator()
  private needsSearchIndexRebuild = true

  override dispose(): void {
    this.indexPrewarmer.dispose()
    this.graphPrecompute.dispose()
    this.searchOperations.dispose()
    this.searchIndexBuildCoordinator.invalidate()
    this.searchIndexUpdateQueue.dispose()
    this.analysisCache.invalidate()
    this.graphResolver.clear()
    void this.workspaceSearchIndex.close()
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
    return this.searchOperations.search(value)
  }

  searchWorkspaceOccurrences(value: unknown) {
    return this.searchOperations.searchOccurrences(value)
  }

  cancelWorkspaceOccurrenceSearch(value: unknown) {
    return this.searchOperations.cancelOccurrenceSearch(value)
  }

  async rebuildSearchIndex(): Promise<void> {
    await this.openWorkspaceSearchIndex()
    this.needsSearchIndexRebuild = true
    if (await this.buildSearchIndexFromWorkspace()) {
      this.needsSearchIndexRebuild = false
    }
  }

  override async setRoot(value: unknown): Promise<FsRootInfo> {
    const previousWorkspaceSearchKey = workspaceSearchKey(this.state)
    const result = await super.setRoot(value)
    if (workspaceSearchKey(this.state) === previousWorkspaceSearchKey) return result
    this.resetSearchIndexState()
    this.analysisCache.invalidate()
    this.graphResolver.clear()
    this.indexPrewarmer.schedule()
    this.scheduleGraphPrecompute()
    return result
  }

  override async setSingleFile(value: unknown): Promise<FsRootInfo> {
    const previousWorkspaceSearchKey = workspaceSearchKey(this.state)
    const result = await super.setSingleFile(value)
    if (workspaceSearchKey(this.state) === previousWorkspaceSearchKey) return result
    this.resetSearchIndexState()
    this.graphPrecompute.cancel()
    this.analysisCache.invalidate()
    this.graphResolver.clear()
    this.indexPrewarmer.schedule()
    return result
  }

  protected onWorkspacePathChanged(_changedPath: string | null, event?: WatchEventName): void {
    this.analysisCache.invalidate()
    this.scheduleGraphPrecompute()
    if (!workspaceChangeAffectsSearch(_changedPath, event)) return
    if (this.activeWorkspaceSearchKey && !this.needsSearchIndexRebuild) {
      this.searchIndexUpdateQueue.schedulePathChange(_changedPath, event)
      return
    }
    this.needsSearchIndexRebuild = true
    this.searchIndexUpdateQueue.scheduleFullRebuild()
  }

  protected override onBuffersFlushed(relativePaths: string[]): void {
    if (relativePaths.length > 0) {
      this.analysisCache.invalidate()
      this.scheduleGraphPrecompute()
    }
    const markdownPaths = relativePaths.filter((value) => isSearchIndexablePath(value))
    if (markdownPaths.length === 0) return

    for (const relativePath of markdownPaths) {
      this.searchIndexUpdateQueue.schedulePathChange(relativePath, 'change')
    }
  }

  private async openWorkspaceSearchIndex(): Promise<void> {
    const searchKey = workspaceSearchKey(this.state)
    const indexPath = workspaceSearchIndexPath(this.app.getPath('userData'), searchKey)
    await this.workspaceSearchIndex.open(indexPath, searchKey)

    if (this.activeWorkspaceSearchKey !== searchKey) {
      this.activeWorkspaceSearchKey = searchKey
      const hasDocuments = await this.workspaceSearchIndex.hasDocuments()
      this.needsSearchIndexRebuild = !hasDocuments
      this.logger.info('workspace search index opened', {
        hasDocuments,
        searchKey: searchKey.slice(0, 12),
      })
    }
  }

  private readonly getWorkspaceAnalysisInput = () =>
    this.analysisCache.getInput(() => this.workspaceDocumentsAndKnownPaths())

  private async rebuildSearchIndexIfNeeded(): Promise<void> {
    if (!this.needsSearchIndexRebuild) return
    if (await this.buildSearchIndexFromWorkspace()) this.needsSearchIndexRebuild = false
  }

  private async prepareWorkspaceSearchIndex(): Promise<void> {
    await this.openWorkspaceSearchIndex()
    await this.searchIndexUpdateQueue.flushPending()
    await this.rebuildSearchIndexIfNeeded()
  }

  private async buildSearchIndexFromWorkspace(): Promise<boolean> {
    return rebuildWorkspaceSearchIndex({
      coordinator: this.searchIndexBuildCoordinator,
      currentSearchKey: () => workspaceSearchKey(this.state),
      index: this.workspaceSearchIndex,
      loadDocuments: () => this.workspaceDocuments(),
      logger: this.logger,
    })
  }

  private resetSearchIndexState(): void {
    this.searchIndexBuildCoordinator.invalidate()
    this.searchIndexUpdateQueue.clear()
    this.activeWorkspaceSearchKey = ''
    this.needsSearchIndexRebuild = true
    void this.workspaceSearchIndex.close().catch((error) => {
      this.logger.warn('search index close failed while switching workspace', { error })
    })
  }

  private scheduleGraphPrecompute(): void {
    if (this.analysisKnowledgeEngineService && this.state.rootKind !== 'single')
      this.graphPrecompute.schedule()
  }
}
