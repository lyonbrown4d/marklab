import type { App, Shell } from 'electron'

import { isSearchIndexablePath } from '@electron/services/workspace/path'
import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import { noopLogger, type Logger } from '@electron/services/logger'
import { fileLabel } from '@electron/services/workspace/markdown/utils'
import type {
  FsGraph,
  FsMarkdownDiagnostic,
  FsRootInfo,
  FsSearchResult,
  FsWorkspaceIndex,
} from '@electron/services/workspace/types'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService'
import { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex'
import { WorkspaceSearchIndexBuildCoordinator } from '@electron/services/workspace/workspaceSearchIndexBuildCoordinator'
import {
  workspaceChangeAffectsSearch,
  workspaceSearchIndexPath,
  workspaceSearchKey,
} from '@electron/services/workspace/workspaceSearchIndexLifecycle'
import { WorkspaceSearchIndexUpdateQueue } from '@electron/services/workspace/workspaceSearchIndexUpdateQueue'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'
import { WorkspaceGraphCache } from '@electron/services/workspace/workspaceGraphCache'
import { WorkspaceAnalysisCache } from '@electron/services/workspace/workspaceAnalysisCache'
import {
  trySidecarMarkdownDiagnostics,
  trySidecarWorkspaceGraph,
} from '@electron/services/workspace/workspaceSidecarFileBridge'
import { mergeMarkdownDiagnostics } from '@electron/services/workspace/markdown/diagnostics'
import { WorkspaceAnalysisWorkerClient } from '@electron/services/workspace/workspaceAnalysisWorkerClient'
import { stringArg, type WatchEventName } from '@electron/services/workspace/workspaceUtils'

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
  private readonly analysisCache = new WorkspaceAnalysisCache()
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
  private readonly searchIndexBuildCoordinator = new WorkspaceSearchIndexBuildCoordinator()
  private needsSearchIndexRebuild = true

  override dispose(): void {
    this.searchIndexBuildCoordinator.invalidate()
    this.searchIndexUpdateQueue.dispose()
    this.analysisCache.invalidate()
    this.graphCache.clear()
    void this.workspaceSearchIndex.close()
    this.analysisWorker.terminate()
    super.dispose()
  }

  async workspaceIndex(): Promise<FsWorkspaceIndex> {
    return this.runSearchIndexTask(
      () =>
        this.analysisCache.getIndex(async () => {
          const { documents, knownPaths } = await this.getWorkspaceAnalysisInput()
          return this.runWorkerTask(
            () =>
              this.analysisWorker.run<FsWorkspaceIndex>({
                type: 'workspace-index',
                documents,
                knownPaths,
              }),
            'workspace-index',
          )
        }),
      'workspace-index',
    )
  }

  async workspaceGraph(): Promise<FsGraph> {
    return this.analysisCache.getGraph(async () => {
      const { documents, knownPaths } = await this.getWorkspaceAnalysisInput()
      const graphKey = this.graphCache.createWorkspaceGraphKey(documents, knownPaths)
      const cachedGraph = this.graphCache.getWorkspaceGraphByKey(graphKey)
      if (cachedGraph) return cachedGraph

      const graph = await trySidecarWorkspaceGraph({
        documents,
        knowledgeEngineService: this.analysisKnowledgeEngineService,
        knownPaths,
        logger: this.logger,
        state: this.state,
      })
      this.graphCache.setWorkspaceGraphByKey(graphKey, graph)
      return graph
    })
  }

  override updateBuffer(value: unknown): ReturnType<WorkspaceFileService['updateBuffer']> {
    const status = super.updateBuffer(value)
    this.analysisCache.invalidate()
    return status
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
      this.logger.info('workspace search completed', {
        queryLength: query.length,
        resultCount: indexedResult.length,
        searchKey: this.activeWorkspaceSearchKey.slice(0, 12),
      })
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
    this.analysisCache.invalidate()
    this.graphCache.clear()
    return result
  }

  override async setSingleFile(value: unknown): Promise<FsRootInfo> {
    const previousWorkspaceSearchKey = workspaceSearchKey(this.state)
    const result = await super.setSingleFile(value)
    if (workspaceSearchKey(this.state) === previousWorkspaceSearchKey) return result
    this.resetSearchIndexState()
    this.analysisCache.invalidate()
    this.graphCache.clear()
    return result
  }

  protected onWorkspacePathChanged(_changedPath: string | null, event?: WatchEventName): void {
    this.analysisCache.invalidate()
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

  private getWorkspaceAnalysisInput() {
    return this.analysisCache.getInput(() => this.workspaceDocumentsAndKnownPaths())
  }

  private async rebuildSearchIndexIfNeeded(): Promise<void> {
    if (!this.needsSearchIndexRebuild) return
    if (await this.buildSearchIndexFromWorkspace()) {
      this.needsSearchIndexRebuild = false
    }
  }

  private async buildSearchIndexFromWorkspace(): Promise<boolean> {
    const searchKey = workspaceSearchKey(this.state)
    return this.searchIndexBuildCoordinator.run(searchKey, async (isCurrent) => {
      const documents = await this.workspaceDocuments()
      if (!isCurrent() || searchKey !== workspaceSearchKey(this.state)) return false
      const indexable = documents.map<WorkspaceSearchDocument>((document) => ({
        path: document.path,
        title: fileLabel(document.path),
        content: document.content,
      }))
      this.logger.info('workspace search index rebuild started', {
        documentCount: indexable.length,
        searchKey: searchKey.slice(0, 12),
      })
      await this.workspaceSearchIndex.rebuild(indexable)
      return isCurrent() && searchKey === workspaceSearchKey(this.state)
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
