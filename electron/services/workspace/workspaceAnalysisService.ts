import { createHash } from 'node:crypto'
import path from 'node:path'
import type { App, Shell } from 'electron'

import { isSearchIndexablePath } from '@electron/services/workspace/path.js'
import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import { noopLogger, type Logger } from '@electron/services/logger.js'
import {
  buildOutlineGraph,
  buildWorkspaceGraph,
  diagnosticsForFile,
  parseMarkdownDocument,
  searchDocuments,
} from '@electron/services/workspace/markdown.js'
import { fileLabel } from '@electron/services/workspace/markdown/utils.js'
import type {
  FsGraph,
  FsMarkdownDiagnostic,
  FsRootInfo,
  FsWorkspaceIndex,
} from '@electron/services/workspace/types.js'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService.js'
import { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex.js'
import { WorkspaceSearchIndexUpdateQueue } from '@electron/services/workspace/workspaceSearchIndexUpdateQueue.js'
import { WorkspaceAnalysisWorkerClient } from '@electron/services/workspace/workspaceAnalysisWorkerClient.js'
import { stringArg, type WatchEventName } from '@electron/services/workspace/workspaceUtils.js'

const SEARCH_INDEX_REBUILD_DELAY_MS = 600

type SearchDocumentToIndex = {
  path: string
  title: string
  content: string
}

export type WorkspaceSearchIndexFactory = () => WorkspaceSearchIndex

export class WorkspaceAnalysisService extends WorkspaceFileService {
  constructor(
    app: App,
    shell: Shell,
    logger: Logger = noopLogger,
    workspaceSearchIndexFactory: WorkspaceSearchIndexFactory = () => new WorkspaceSearchIndex(),
    knowledgeEngineService?: KnowledgeEngineService,
  ) {
    super(app, shell, logger, knowledgeEngineService)
    this.workspaceSearchIndex = workspaceSearchIndexFactory()
  }

  private readonly analysisWorker = new WorkspaceAnalysisWorkerClient(
    this.logger.child('analysis-worker'),
  )
  private readonly workspaceSearchIndex: WorkspaceSearchIndex
  private readonly searchIndexUpdateQueue =
    new WorkspaceSearchIndexUpdateQueue<SearchDocumentToIndex>({
      delayMs: SEARCH_INDEX_REBUILD_DELAY_MS,
      loadDocuments: (paths) => this.loadDocuments(paths),
      logger: this.logger.child('search-index-updates'),
      markNeedsRebuild: () => {
        this.needsSearchIndexRebuild = true
      },
      openIndex: () => this.openWorkspaceSearchIndex(),
      rebuildAll: async () => {
        await this.buildSearchIndexFromWorkspace()
        this.needsSearchIndexRebuild = false
      },
      removeDocument: (pathValue) => this.workspaceSearchIndex.removeDocument(pathValue),
      removePathPrefix: (pathValue) => this.workspaceSearchIndex.removePathPrefix(pathValue),
      runTask: (work, fallback, taskName) => this.runSearchIndexTask(work, fallback, taskName),
      upsertDocument: (document) => this.workspaceSearchIndex.upsertDocument(document),
    })
  private activeWorkspaceSearchKey = ''
  private needsSearchIndexRebuild = true

  override dispose(): void {
    this.searchIndexUpdateQueue.dispose()
    void this.workspaceSearchIndex.close()
    this.analysisWorker.terminate()
    super.dispose()
  }

  async workspaceIndex(): Promise<FsWorkspaceIndex> {
    return this.runSearchIndexTask(async () => {
      const { documents, knownPaths } = await this.workspaceDocumentsAndKnownPaths()
      return this.runWorkerTask(
        () =>
          this.analysisWorker.run({
            type: 'workspace-index',
            documents,
            knownPaths,
          }),
        async () => this.buildWorkspaceIndexFromDocuments(documents, knownPaths),
        'workspace-index',
      )
    })
  }

  async workspaceGraph(): Promise<FsGraph> {
    const { documents, knownPaths } = await this.workspaceDocumentsAndKnownPaths()
    return this.runWorkerTask(
      () =>
        this.analysisWorker.run({
          type: 'workspace-graph',
          documents,
          knownPaths,
        }),
      async () => buildWorkspaceGraph(this.buildWorkspaceIndexFromDocuments(documents, knownPaths)),
      'workspace-graph',
    )
  }

  async outlineGraph(value: unknown): Promise<FsGraph> {
    const relativePath = stringArg(value, 'path')
    const content = await this.readFile({ path: relativePath })
    return this.runWorkerTask(
      () =>
        this.analysisWorker.run({
          type: 'outline-graph',
          path: relativePath,
          content,
        }),
      async () => buildOutlineGraph(relativePath, content),
      'outline-graph',
    )
  }

  async analyzeMarkdownBuffer(value: unknown): Promise<FsMarkdownDiagnostic[]> {
    const pathValue = stringArg(value, 'path')
    const content = stringArg(value, 'content')
    const { documents, knownPaths } = await this.workspaceDocumentsAndKnownPaths(pathValue, content)
    return this.runWorkerTask(
      () =>
        this.analysisWorker.run({
          type: 'markdown-diagnostics',
          documents,
          knownPaths,
          path: pathValue,
        }),
      async () =>
        diagnosticsForFile(this.buildWorkspaceIndexFromDocuments(documents, knownPaths), pathValue),
      'markdown-diagnostics',
    )
  }

  async searchWorkspace(value: unknown): Promise<ReturnType<typeof searchDocuments>> {
    const query = stringArg(value, 'query')
    const limitValue = value && typeof value === 'object' && 'limit' in value ? value.limit : 20
    const limit = typeof limitValue === 'number' && Number.isFinite(limitValue) ? limitValue : 20

    return this.runSearchIndexTask(
      async () => {
        await this.openWorkspaceSearchIndex()
        await this.searchIndexUpdateQueue.flushPending()
        await this.rebuildSearchIndexIfNeeded()

        const indexedResult = await this.workspaceSearchIndex.search(query, limit)
        return indexedResult
      },
      async () => {
        const documents = await this.workspaceDocuments()
        return searchDocuments(documents, query, limit)
      },
      'search-documents',
    )
  }

  async rebuildSearchIndex(): Promise<void> {
    await this.openWorkspaceSearchIndex()
    this.needsSearchIndexRebuild = true
    await this.buildSearchIndexFromWorkspace()
    this.needsSearchIndexRebuild = false
  }

  override async setRoot(value: unknown): Promise<FsRootInfo> {
    const result = await super.setRoot(value)
    this.resetSearchIndexState()
    return result
  }

  override async setSingleFile(value: unknown): Promise<FsRootInfo> {
    const result = await super.setSingleFile(value)
    this.resetSearchIndexState()
    return result
  }

  protected onWorkspacePathChanged(_changedPath: string | null, event?: WatchEventName): void {
    if (!this.indexChangeAffectsSearch(_changedPath, event)) return
    if (this.activeWorkspaceSearchKey && !this.needsSearchIndexRebuild) {
      this.searchIndexUpdateQueue.schedulePathChange(_changedPath, event)
      return
    }
    this.needsSearchIndexRebuild = true
    this.searchIndexUpdateQueue.scheduleFullRebuild()
  }

  protected override onBuffersFlushed(relativePaths: string[]): void {
    const markdownPaths = relativePaths.filter((value) => isSearchIndexablePath(value))
    if (markdownPaths.length === 0) return

    void this.runSearchIndexTask(
      async () => {
        await this.openWorkspaceSearchIndex()
        const documents = await this.loadDocuments(markdownPaths)
        for (const document of documents) {
          await this.workspaceSearchIndex.upsertDocument(document)
        }
      },
      async () => {
        this.needsSearchIndexRebuild = true
      },
      'search-index',
    ).catch((error) => {
      this.logger.warn('search index update from flush failed; scheduling full rebuild', { error })
      this.needsSearchIndexRebuild = true
    })
  }

  private async openWorkspaceSearchIndex(): Promise<void> {
    const workspaceSearchKey = this.getWorkspaceSearchKey()
    const indexPath = this.getWorkspaceSearchIndexPath()
    await this.workspaceSearchIndex.open(indexPath, workspaceSearchKey)

    if (this.activeWorkspaceSearchKey !== workspaceSearchKey) {
      this.activeWorkspaceSearchKey = workspaceSearchKey
      this.needsSearchIndexRebuild = !(await this.workspaceSearchIndex.hasDocuments())
    }
  }

  private async rebuildSearchIndexIfNeeded(): Promise<void> {
    if (!this.needsSearchIndexRebuild) return
    await this.buildSearchIndexFromWorkspace()
    this.needsSearchIndexRebuild = false
  }

  private async buildSearchIndexFromWorkspace(): Promise<void> {
    const documents = await this.workspaceDocuments()
    const indexable = documents.map<SearchDocumentToIndex>((document) => ({
      path: document.path,
      title: fileLabel(document.path),
      content: document.content,
    }))
    await this.workspaceSearchIndex.rebuild(indexable)
  }

  private getWorkspaceSearchIndexPath(): string {
    return path.join(
      this.app.getPath('userData'),
      'cache',
      'search-index',
      this.getWorkspaceSearchKey(),
    )
  }

  private getWorkspaceSearchKey(): string {
    const raw = `${this.state.rootKind}|${this.state.rootPath}|${this.state.singleFile ?? ''}`
    return createHash('sha256').update(raw).digest('hex')
  }

  private buildWorkspaceIndexFromDocuments(
    documents: Array<{ path: string; content: string }>,
    knownPaths: { paths: string[]; assetPaths: string[] },
  ): FsWorkspaceIndex {
    return {
      files: documents.map((document) => parseMarkdownDocument(document.path, document.content)),
      paths: knownPaths.paths,
      asset_paths: knownPaths.assetPaths,
    }
  }

  private indexChangeAffectsSearch(pathValue: string | null, event?: WatchEventName): boolean {
    if (!pathValue || !event) return true
    if (event === 'addDir') return false
    return event === 'unlinkDir' || isSearchIndexablePath(pathValue)
  }

  private resetSearchIndexState(): void {
    this.searchIndexUpdateQueue.clear()
    this.activeWorkspaceSearchKey = ''
    this.needsSearchIndexRebuild = true
    void this.workspaceSearchIndex.close().catch((error) => {
      this.logger.warn('search index close failed while switching workspace', { error })
    })
  }

  private async loadDocuments(relativePaths: string[]): Promise<Array<SearchDocumentToIndex>> {
    const documents: Array<SearchDocumentToIndex> = []
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
        await this.workspaceSearchIndex.removeDocument(relativePath).catch(() => undefined)
      }
    }
    return documents
  }
}
