import {
  buildOutlineGraph,
  buildWorkspaceGraph,
  diagnosticsForFile,
  parseMarkdownDocument,
  searchDocuments,
} from '@electron/services/workspace/markdown.js'
import type {
  FsGraph,
  FsMarkdownDiagnostic,
  FsWorkspaceIndex,
} from '@electron/services/workspace/types.js'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService.js'
import { WorkspaceAnalysisWorkerClient } from '@electron/services/workspace/workspaceAnalysisWorkerClient.js'
import { stringArg } from '@electron/services/workspace/workspaceUtils.js'

export class WorkspaceAnalysisService extends WorkspaceFileService {
  private readonly analysisWorker = new WorkspaceAnalysisWorkerClient(
    this.logger.child('analysis-worker'),
  )

  override dispose(): void {
    this.analysisWorker.terminate()
    super.dispose()
  }

  async workspaceIndex(): Promise<FsWorkspaceIndex> {
    return this.runSearchIndexTask(async () => {
      const documents = await this.workspaceDocuments()
      const knownPaths = await this.workspaceKnownPaths()
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
    const documents = await this.workspaceDocuments()
    const knownPaths = await this.workspaceKnownPaths()
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
    const documents = await this.workspaceDocuments(pathValue, content)
    const knownPaths = await this.workspaceKnownPaths()
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
    return this.runSearchIndexTask(async () => {
      const documents = await this.workspaceDocuments()
      return this.runWorkerTask(
        () =>
          this.analysisWorker.run({
            type: 'search-documents',
            documents,
            query,
            limit,
          }),
        async () => searchDocuments(documents, query, limit),
        'search-documents',
      )
    })
  }

  async rebuildSearchIndex(): Promise<void> {
    await this.runSearchIndexTask(async () => {
      const documents = await this.workspaceDocuments()
      const knownPaths = await this.workspaceKnownPaths()
      await this.runWorkerTask(
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

  private async runWorkerTask<T>(
    task: () => Promise<T>,
    fallback: () => Promise<T> | T,
    taskName: string,
  ): Promise<T> {
    try {
      return await task()
    } catch (error) {
      this.logger.warn('workspace analysis worker task failed; using main-thread fallback', {
        error,
        task: taskName,
      })
      return fallback()
    }
  }
}
