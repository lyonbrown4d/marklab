import { KnowledgeEngineRuntime } from '@electron/services/knowledgeEngine/knowledgeEngineRuntime'
import type {
  KnowledgeCloseDocumentInput,
  KnowledgeDocumentChangeInput,
  KnowledgeMarkdownDocumentSymbol,
  KnowledgeMarkdownLink,
  KnowledgeOpenDocumentInput,
  KnowledgeResyncDocumentInput,
  KnowledgeSyncResponse,
  KnowledgeWorkspaceGraph,
  KnowledgeWorkspaceStatus,
  KnowledgeWorkspacePathMutation,
} from '@electron/services/knowledgeEngine/knowledgeEngineTypes'
import type { WorkspaceSidecarManager } from '@electron/services/knowledgeEngine/workspaceSidecarManager'
import type {
  FsEntry,
  FsMarkdownDiagnostic,
  FsPathMetadata,
  FsSearchResult,
  FsSnapshot,
} from '@electron/services/workspace/types'
import type {
  WorkspaceSearchDocument,
  WorkspaceSearchMutationBatch,
  WorkspaceOccurrenceSearchRequest,
  WorkspaceOccurrenceSearchResultSet,
} from '@electron/services/workspace/workspaceSearchTypes'
import type {
  KnowledgeSearchOptions,
  KnowledgeSearchResultSet,
} from '@electron/services/knowledgeEngine/knowledgeSearch'
import { WorkspaceAnalysisScheduler } from '@electron/services/workspace/workspaceAnalysisConcurrency'

export class KnowledgeEngineWorkspaceFacade {
  private readonly analysisScheduler: WorkspaceAnalysisScheduler

  constructor(
    private readonly runtime: KnowledgeEngineRuntime,
    workspaceAnalysisScheduler?: WorkspaceAnalysisScheduler,
  ) {
    this.analysisScheduler = workspaceAnalysisScheduler ?? new WorkspaceAnalysisScheduler()
  }

  async openWorkspace(workspaceId: string, indexPath: string): Promise<void> {
    await (await this.getSidecars()).open(workspaceId, indexPath)
  }

  async prepareWorkspaceFileAccess(workspaceId: string, workspaceRoot: string): Promise<void> {
    await (await this.getSidecars()).open(workspaceId, workspaceRoot, { openWorkspace: false })
  }

  async closeWorkspace(workspaceId: string): Promise<void> {
    await (await this.getSidecars()).close(workspaceId)
  }

  async hasDocuments(workspaceId: string): Promise<boolean> {
    return (await this.getSidecars()).hasDocuments(workspaceId)
  }

  async getWorkspaceStatus(workspaceId: string): Promise<KnowledgeWorkspaceStatus> {
    return (await this.getSidecars()).getWorkspaceStatus(workspaceId)
  }

  async getWorkspaceFileSnapshot(
    workspaceId: string,
    workspaceRoot: string,
    root: FsSnapshot['root'],
  ): Promise<FsSnapshot> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.getWorkspaceFileSnapshot(workspaceId, root)
  }

  async listWorkspaceEntries(workspaceId: string, workspaceRoot: string): Promise<FsEntry[]> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.listWorkspaceEntries(workspaceId)
  }

  async readWorkspaceFile(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
  ): Promise<string> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.readWorkspaceFile(workspaceId, path)
  }

  async writeWorkspaceFile(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
    content: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.writeWorkspaceFile(workspaceId, path, content)
  }
  async createWorkspaceFile(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.createWorkspaceFile(workspaceId, path)
  }

  async createWorkspaceDirectory(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.createWorkspaceDirectory(workspaceId, path)
  }

  async renameWorkspacePath(
    workspaceId: string,
    workspaceRoot: string,
    from: string,
    to: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.renameWorkspacePath(workspaceId, from, to)
  }

  async deleteWorkspacePath(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.deleteWorkspacePath(workspaceId, path)
  }

  async getWorkspacePathMetadata(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
  ): Promise<FsPathMetadata> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.getWorkspacePathMetadata(workspaceId, path)
  }

  async rebuildIndex(workspaceId: string, documents: WorkspaceSearchDocument[]): Promise<void> {
    await (await this.getSidecars()).rebuildIndex(workspaceId, documents)
  }

  async applySearchChanges(
    workspaceId: string,
    batch: WorkspaceSearchMutationBatch,
  ): Promise<void> {
    await (await this.getSidecars()).applySearchChanges(workspaceId, batch)
  }

  async upsertDocument(workspaceId: string, document: WorkspaceSearchDocument): Promise<void> {
    await (await this.getSidecars()).upsertDocument(workspaceId, document)
  }

  async removeDocument(workspaceId: string, path: string): Promise<void> {
    await (await this.getSidecars()).removeDocument(workspaceId, path)
  }

  async removePathPrefix(workspaceId: string, prefix: string): Promise<void> {
    await (await this.getSidecars()).removePathPrefix(workspaceId, prefix)
  }

  async openMarkdownDocument(
    workspaceId: string,
    document: KnowledgeOpenDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    return (await this.getSidecars()).openMarkdownDocument(workspaceId, document)
  }

  async changeMarkdownDocument(
    workspaceId: string,
    change: KnowledgeDocumentChangeInput,
  ): Promise<KnowledgeSyncResponse> {
    return (await this.getSidecars()).changeMarkdownDocument(workspaceId, change)
  }

  async resyncMarkdownDocument(
    workspaceId: string,
    document: KnowledgeResyncDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    return (await this.getSidecars()).resyncMarkdownDocument(workspaceId, document)
  }

  async closeMarkdownDocument(
    workspaceId: string,
    document: KnowledgeCloseDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    return (await this.getSidecars()).closeMarkdownDocument(workspaceId, document)
  }

  async getMarkdownDocumentSymbols(
    workspaceId: string,
    documentId: string,
    documentVersion: number | string,
  ): Promise<KnowledgeMarkdownDocumentSymbol[]> {
    return (await this.getSidecars()).getMarkdownDocumentSymbols(
      workspaceId,
      documentId,
      documentVersion,
    )
  }

  async getMarkdownLinks(
    workspaceId: string,
    documentId: string,
    documentVersion: number | string,
  ): Promise<KnowledgeMarkdownLink[]> {
    return (await this.getSidecars()).getMarkdownLinks(workspaceId, documentId, documentVersion)
  }

  async getMarkdownDiagnostics(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
    content: string,
    signal?: AbortSignal,
  ): Promise<FsMarkdownDiagnostic[]> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return signal
      ? sidecars.getMarkdownDiagnostics(workspaceId, path, content, signal)
      : sidecars.getMarkdownDiagnostics(workspaceId, path, content)
  }

  async buildWorkspaceGraph(
    workspaceId: string,
    workspaceRoot: string,
    documents: Array<{ path: string; title?: string; content: string }>,
    knownPaths: { paths: string[]; assetPaths: string[] },
  ): Promise<KnowledgeWorkspaceGraph> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return this.analysisScheduler.run(() =>
      sidecars.buildWorkspaceGraph(workspaceId, documents, knownPaths),
    )
  }

  async search(workspaceId: string, query: string, limit: number): Promise<FsSearchResult[]> {
    return (await this.getSidecars()).search(workspaceId, query, limit)
  }

  async searchOccurrences(
    workspaceId: string,
    request: WorkspaceOccurrenceSearchRequest,
    signal?: AbortSignal,
  ): Promise<WorkspaceOccurrenceSearchResultSet> {
    const sidecars = await this.getSidecars()
    return this.analysisScheduler.run(
      () => sidecars.searchOccurrences(workspaceId, request, signal),
      signal,
    )
  }

  async searchWithOptions(
    workspaceId: string,
    query: string,
    options: KnowledgeSearchOptions,
  ): Promise<KnowledgeSearchResultSet> {
    return (await this.getSidecars()).searchWithOptions(workspaceId, query, options)
  }

  private getSidecars(): Promise<WorkspaceSidecarManager> {
    return this.runtime.sidecars()
  }
}
