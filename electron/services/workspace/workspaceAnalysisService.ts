import type { App, Shell } from 'electron'

import { isSearchIndexablePath } from '@electron/services/workspace/path.js'
import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types.js'
import { noopLogger, type Logger } from '@electron/services/logger.js'
import { fileLabel } from '@electron/services/workspace/markdown/utils.js'
import type {
  FsGraph,
  FsMarkdownDiagnostic,
  FsRootInfo,
  FsSearchResult,
  FsWorkspaceIndex,
} from '@electron/services/workspace/types.js'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService.js'
import { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex.js'
import {
  workspaceChangeAffectsSearch,
  workspaceSearchIndexPath,
  workspaceSearchKey,
} from '@electron/services/workspace/workspaceSearchIndexLifecycle.js'
import { WorkspaceSearchIndexUpdateQueue } from '@electron/services/workspace/workspaceSearchIndexUpdateQueue.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'
import { WorkspaceGraphCache } from '@electron/services/workspace/workspaceGraphCache.js'
import {
  trySidecarOutlineGraph,
  trySidecarMarkdownDiagnostics,
  trySidecarWorkspaceGraph,
} from '@electron/services/workspace/workspaceSidecarFileBridge.js'
import { mergeMarkdownDiagnostics } from '@electron/services/workspace/markdown/diagnostics.js'
import { WorkspaceAnalysisWorkerClient } from '@electron/services/workspace/workspaceAnalysisWorkerClient.js'
import { stringArg, type WatchEventName } from '@electron/services/workspace/workspaceUtils.js'

const SEARCH_INDEX_REBUILD_DELAY_MS = 600

export type WorkspaceSearchIndexFactory = () => WorkspaceSearchIndex

export class WorkspaceAnalysisService extends WorkspaceFileService {
  constructor(
    app: App,
    shell: Shell,
    logger: Logger = noopLogger,
    localHistoryService: LocalHistoryServiceContract,
    workspaceSearchIndexFactory: WorkspaceSearchIndexFactory = () => new WorkspaceSearchIndex(),
    private readonly analysisKnowledgeEngineService?: KnowledgeEngineService,
  ) {
    super(app, shell, logger, localHistoryService, analysisKnowledgeEngineService)
    this.workspaceSearchIndex = workspaceSearchIndexFactory()
  }

  private readonly analysisWorker = new WorkspaceAnalysisWorkerClient(
    this.logger.child('analysis-worker'),
  )
  private readonly workspaceSearchIndex: WorkspaceSearchIndex
  private readonly graphCache = new WorkspaceGraphCache()
  private readonly searchIndexUpdateQueue =
    new WorkspaceSearchIndexUpdateQueue<WorkspaceSearchDocument>({
      applyChanges: (changes) => this.workspaceSearchIndex.applySearchChanges(changes),
      delayMs: SEARCH_INDEX_REBUILD_DELAY_MS,
      getDocumentPath: (document) => document.path,
      loadDocuments: (paths) => this.loadDocuments(paths),
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
  private searchIndexBuildGeneration = 0
  private needsSearchIndexRebuild = true

  override dispose(): void {
    this.searchIndexBuildGeneration += 1
    this.searchIndexUpdateQueue.dispose()
    this.graphCache.clear()
    void this.workspaceSearchIndex.close()
    this.analysisWorker.terminate()
    super.dispose()
  }

  async workspaceIndex(): Promise<FsWorkspaceIndex> {
    return this.runSearchIndexTask(async () => {
      const { documents, knownPaths } = await this.workspaceDocumentsAndKnownPaths()
      return this.runWorkerTask(
        () =>
          this.analysisWorker.run<FsWorkspaceIndex>({
            type: 'workspace-index',
            documents,
            knownPaths,
          }),
        'workspace-index',
      )
    })
  }

  async workspaceGraph(): Promise<FsGraph> {
    const { documents, knownPaths } = await this.workspaceDocumentsAndKnownPaths()
    const cachedGraph = this.graphCache.getWorkspaceGraph(documents, knownPaths)
    if (cachedGraph) return cachedGraph

    const graph = await trySidecarWorkspaceGraph({
      documents,
      knowledgeEngineService: this.analysisKnowledgeEngineService,
      knownPaths,
      logger: this.logger,
      state: this.state,
    })
    this.graphCache.setWorkspaceGraph(documents, knownPaths, graph)
    return graph
  }

  async outlineGraph(value: unknown): Promise<FsGraph> {
    const relativePath = stringArg(value, 'path')
    const content = await this.readFile({ path: relativePath })
    const cachedGraph = this.graphCache.getOutlineGraph(relativePath, content)
    if (cachedGraph) return cachedGraph

    const graph = await trySidecarOutlineGraph({
      content,
      knowledgeEngineService: this.analysisKnowledgeEngineService,
      logger: this.logger,
      path: relativePath,
      state: this.state,
    })
    this.graphCache.setOutlineGraph(relativePath, content, graph)
    return graph
  }

  async analyzeMarkdownBuffer(value: unknown): Promise<FsMarkdownDiagnostic[]> {
    const pathValue = stringArg(value, 'path')
    const content = stringArg(value, 'content')
    const { documents, knownPaths } = await this.workspaceDocumentsAndKnownPaths(pathValue, content)
    const [localDiagnostics, sidecarDiagnostics] = await Promise.all([
      this.runWorkerTask(
        () =>
          this.analysisWorker.run<FsMarkdownDiagnostic[]>({
            type: 'markdown-diagnostics',
            documents,
            knownPaths,
            path: pathValue,
          }),
        'markdown-diagnostics',
      ),
      trySidecarMarkdownDiagnostics({
        content,
        knowledgeEngineService: this.analysisKnowledgeEngineService,
        logger: this.logger,
        path: pathValue,
        state: this.state,
      }),
    ])
    return mergeMarkdownDiagnostics(localDiagnostics, sidecarDiagnostics)
  }

  async searchWorkspace(value: unknown): Promise<FsSearchResult[]> {
    const query = stringArg(value, 'query')
    const limitValue = value && typeof value === 'object' && 'limit' in value ? value.limit : 20
    const limit = typeof limitValue === 'number' && Number.isFinite(limitValue) ? limitValue : 20

    return this.runSearchIndexTask(async () => {
      await this.openWorkspaceSearchIndex()
      await this.searchIndexUpdateQueue.flushPending()
      await this.rebuildSearchIndexIfNeeded()

      const indexedResult = await this.workspaceSearchIndex.search(query, limit)
      return indexedResult
    }, 'search-documents')
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
    this.graphCache.clear()
    return result
  }

  override async setSingleFile(value: unknown): Promise<FsRootInfo> {
    const previousWorkspaceSearchKey = workspaceSearchKey(this.state)
    const result = await super.setSingleFile(value)
    if (workspaceSearchKey(this.state) === previousWorkspaceSearchKey) return result
    this.resetSearchIndexState()
    this.graphCache.clear()
    return result
  }

  protected onWorkspacePathChanged(_changedPath: string | null, event?: WatchEventName): void {
    this.graphCache.clear()
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
      this.graphCache.clear()
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
      this.needsSearchIndexRebuild = !(await this.workspaceSearchIndex.hasDocuments())
    }
  }

  private async rebuildSearchIndexIfNeeded(): Promise<void> {
    if (!this.needsSearchIndexRebuild) return
    if (await this.buildSearchIndexFromWorkspace()) {
      this.needsSearchIndexRebuild = false
    }
  }

  private async buildSearchIndexFromWorkspace(): Promise<boolean> {
    const generation = ++this.searchIndexBuildGeneration
    const searchKey = workspaceSearchKey(this.state)
    const documents = await this.workspaceDocuments()
    if (!this.isCurrentSearchIndexBuild(generation, searchKey)) return false
    const indexable = documents.map<WorkspaceSearchDocument>((document) => ({
      path: document.path,
      title: fileLabel(document.path),
      content: document.content,
    }))
    await this.workspaceSearchIndex.rebuild(indexable)
    return this.isCurrentSearchIndexBuild(generation, searchKey)
  }

  private isCurrentSearchIndexBuild(generation: number, searchKey: string): boolean {
    return (
      generation === this.searchIndexBuildGeneration && searchKey === workspaceSearchKey(this.state)
    )
  }

  private resetSearchIndexState(): void {
    this.searchIndexBuildGeneration += 1
    this.searchIndexUpdateQueue.clear()
    this.activeWorkspaceSearchKey = ''
    this.needsSearchIndexRebuild = true
    void this.workspaceSearchIndex.close().catch((error) => {
      this.logger.warn('search index close failed while switching workspace', { error })
    })
  }

  private async loadDocuments(relativePaths: string[]): Promise<WorkspaceSearchDocument[]> {
    const documents: WorkspaceSearchDocument[] = []
    for (const relativePath of relativePaths) {
      try {
        const content = await this.readFile({ path: relativePath })
        documents.push({
          path: relativePath,
          title: fileLabel(relativePath),
          content,
        })
      } catch (error) {
        this.logger.warn('failed to read flushed file for search index update', {
          error,
          path: relativePath,
        })
      }
    }
    return documents
  }
}
