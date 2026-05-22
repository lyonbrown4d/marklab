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
import { stringArg } from '@electron/services/workspace/workspaceUtils.js'

export class WorkspaceAnalysisService extends WorkspaceFileService {
  async workspaceIndex(): Promise<FsWorkspaceIndex> {
    return this.runSearchIndexTask(() => this.buildWorkspaceIndex())
  }

  async workspaceGraph(): Promise<FsGraph> {
    return buildWorkspaceGraph(await this.workspaceIndex())
  }

  async outlineGraph(value: unknown): Promise<FsGraph> {
    const relativePath = stringArg(value, 'path')
    return buildOutlineGraph(relativePath, await this.readFile({ path: relativePath }))
  }

  async analyzeMarkdownBuffer(value: unknown): Promise<FsMarkdownDiagnostic[]> {
    const pathValue = stringArg(value, 'path')
    const content = stringArg(value, 'content')
    const documents = await this.workspaceDocuments(pathValue, content)
    const knownPaths = await this.workspaceKnownPaths()
    const index = {
      files: documents.map((document) => parseMarkdownDocument(document.path, document.content)),
      paths: knownPaths.paths,
      asset_paths: knownPaths.assetPaths,
    }
    return diagnosticsForFile(index, pathValue)
  }

  async searchWorkspace(value: unknown): Promise<ReturnType<typeof searchDocuments>> {
    const query = stringArg(value, 'query')
    const limitValue = value && typeof value === 'object' && 'limit' in value ? value.limit : 20
    const limit = typeof limitValue === 'number' && Number.isFinite(limitValue) ? limitValue : 20
    return this.runSearchIndexTask(async () =>
      searchDocuments(await this.workspaceDocuments(), query, limit),
    )
  }

  async rebuildSearchIndex(): Promise<void> {
    await this.runSearchIndexTask(async () => {
      await this.buildWorkspaceIndex()
    })
  }
}
