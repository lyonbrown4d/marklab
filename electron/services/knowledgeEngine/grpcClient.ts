import type {
  FsEntry,
  FsPathMetadata,
  FsSearchResult,
  FsSnapshot,
} from '@electron/services/workspace/types.js'
import type { WorkspaceDocument } from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'
import type {
  KnowledgeCloseDocumentInput,
  KnowledgeDocumentChangeInput,
  KnowledgeDocumentVersion,
  KnowledgeMarkdownDocumentSymbol,
  KnowledgeMarkdownLink,
  KnowledgeOpenDocumentInput,
  KnowledgeWorkspaceStatus,
  KnowledgeWorkspacePathMutation,
  KnowledgeResyncDocumentInput,
  KnowledgeSyncResponse,
  KnowledgeEngineGrpcClientOptions,
} from '@electron/services/knowledgeEngine/knowledgeEngineTypes.js'
import type {
  KnowledgeSearchOptions,
  KnowledgeSearchResultSet,
} from '@electron/services/knowledgeEngine/knowledgeSearch.js'
import { invokeUnary } from '@electron/services/knowledgeEngine/grpcClientRuntime.js'
import {
  changeMarkdownDocumentSync,
  closeMarkdownDocumentSync,
  openMarkdownDocumentSync,
  resyncMarkdownDocumentSync,
} from '@electron/services/knowledgeEngine/grpcMarkdownSync.js'
import { runSearchWithOptions } from '@electron/services/knowledgeEngine/grpcSearchStream.js'
import {
  createWorkspaceDirectory,
  createWorkspaceFile,
  deleteWorkspacePath,
  getWorkspaceFileSnapshot,
  getWorkspacePathMetadata,
  listWorkspaceEntries,
  readWorkspaceFile,
  renameWorkspacePath,
} from '@electron/services/knowledgeEngine/grpcWorkspaceVfsClient.js'
import {
  createKnowledgeEngineGrpcClients,
  type KnowledgeEngineGrpcClients,
} from '@electron/services/knowledgeEngine/grpcClientFactory.js'
export type {
  KnowledgeSearchOptions,
  KnowledgeSearchOrder,
  KnowledgeSearchDiagnostics,
  KnowledgeSearchResultSet,
} from '@electron/services/knowledgeEngine/knowledgeSearch.js'
export type {
  KnowledgeCloseDocumentInput,
  KnowledgeDocumentChangeInput,
  KnowledgeDocumentVersion,
  KnowledgeMarkdownDocumentSymbol,
  KnowledgeMarkdownLink,
  KnowledgeOpenDocumentInput,
  KnowledgeWorkspaceStatus,
  KnowledgeWorkspacePathMutation,
  KnowledgeResyncDocumentInput,
  KnowledgeSyncResponse,
  KnowledgeEngineGrpcClientOptions,
} from '@electron/services/knowledgeEngine/knowledgeEngineTypes.js'
export class KnowledgeEngineGrpcClient {
  private readonly clients: KnowledgeEngineGrpcClients

  constructor(private readonly options: KnowledgeEngineGrpcClientOptions) {
    this.clients = createKnowledgeEngineGrpcClients(options)
  }

  getCapabilities(workspaceInstanceId: string) {
    return invokeUnary(
      this.options.sessionToken,
      this.clients.control,
      this.clients.control.getCapabilities,
      { workspaceInstanceId },
    )
  }

  async openWorkspace(indexPath: string): Promise<void> {
    await invokeUnary(
      this.options.sessionToken,
      this.clients.workspace,
      this.clients.workspace.openWorkspace,
      { indexPath },
    )
  }

  async closeWorkspace(): Promise<void> {
    await invokeUnary(
      this.options.sessionToken,
      this.clients.workspace,
      this.clients.workspace.closeWorkspace,
      {},
    )
  }

  async hasDocuments(): Promise<boolean> {
    const response = await invokeUnary(
      this.options.sessionToken,
      this.clients.workspace,
      this.clients.workspace.hasDocuments,
      {},
    )
    return response.hasDocuments
  }

  getWorkspaceStatus(): Promise<KnowledgeWorkspaceStatus> {
    return invokeUnary(
      this.options.sessionToken,
      this.clients.workspace,
      this.clients.workspace.getWorkspaceStatus,
      {},
    )
  }

  getWorkspaceFileSnapshot(root: FsSnapshot['root']): Promise<FsSnapshot> {
    return getWorkspaceFileSnapshot(this.options.sessionToken, this.clients.workspaceVfs, root)
  }

  listWorkspaceEntries(): Promise<FsEntry[]> {
    return listWorkspaceEntries(this.options.sessionToken, this.clients.workspaceVfs)
  }

  readWorkspaceFile(path: string): Promise<string> {
    return readWorkspaceFile(this.options.sessionToken, this.clients.workspaceVfs, path)
  }

  createWorkspaceFile(path: string): Promise<KnowledgeWorkspacePathMutation> {
    return createWorkspaceFile(this.options.sessionToken, this.clients.workspaceVfs, path)
  }

  createWorkspaceDirectory(path: string): Promise<KnowledgeWorkspacePathMutation> {
    return createWorkspaceDirectory(this.options.sessionToken, this.clients.workspaceVfs, path)
  }

  renameWorkspacePath(from: string, to: string): Promise<KnowledgeWorkspacePathMutation> {
    return renameWorkspacePath(this.options.sessionToken, this.clients.workspaceVfs, from, to)
  }

  deleteWorkspacePath(path: string): Promise<KnowledgeWorkspacePathMutation> {
    return deleteWorkspacePath(this.options.sessionToken, this.clients.workspaceVfs, path)
  }

  getWorkspacePathMetadata(path: string): Promise<FsPathMetadata> {
    return getWorkspacePathMetadata(this.options.sessionToken, this.clients.workspaceVfs, path)
  }
  async rebuildIndex(documents: WorkspaceDocument[]): Promise<void> {
    await invokeUnary(
      this.options.sessionToken,
      this.clients.workspace,
      this.clients.workspace.rebuildIndex,
      { documents },
    )
  }

  async upsertDocument(document: WorkspaceDocument): Promise<void> {
    await invokeUnary(
      this.options.sessionToken,
      this.clients.workspace,
      this.clients.workspace.upsertDocument,
      { document },
    )
  }

  async removeDocument(path: string): Promise<void> {
    await invokeUnary(
      this.options.sessionToken,
      this.clients.workspace,
      this.clients.workspace.removeDocument,
      { path },
    )
  }

  async removePathPrefix(prefix: string): Promise<void> {
    await invokeUnary(
      this.options.sessionToken,
      this.clients.workspace,
      this.clients.workspace.removePathPrefix,
      { prefix },
    )
  }

  openMarkdownDocument(
    workspaceInstanceId: string,
    document: KnowledgeOpenDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    return openMarkdownDocumentSync(
      this.options.sessionToken,
      this.clients.documentSession,
      workspaceInstanceId,
      document,
    )
  }

  changeMarkdownDocument(
    workspaceInstanceId: string,
    change: KnowledgeDocumentChangeInput,
  ): Promise<KnowledgeSyncResponse> {
    return changeMarkdownDocumentSync(
      this.options.sessionToken,
      this.clients.documentSession,
      workspaceInstanceId,
      change,
    )
  }

  closeMarkdownDocument(
    workspaceInstanceId: string,
    document: KnowledgeCloseDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    return closeMarkdownDocumentSync(
      this.options.sessionToken,
      this.clients.documentSession,
      workspaceInstanceId,
      document,
    )
  }

  resyncMarkdownDocument(
    workspaceInstanceId: string,
    document: KnowledgeResyncDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    return resyncMarkdownDocumentSync(
      this.options.sessionToken,
      this.clients.documentSession,
      workspaceInstanceId,
      document,
    )
  }

  async getMarkdownDocumentSymbols(
    documentId: string,
    documentVersion: KnowledgeDocumentVersion,
  ): Promise<KnowledgeMarkdownDocumentSymbol[]> {
    const response = await invokeUnary(
      this.options.sessionToken,
      this.clients.markdown,
      this.clients.markdown.getDocumentSymbols,
      {
        documentId,
        documentVersion: versionToProto(documentVersion),
      },
    )
    return response.symbols
  }

  async getMarkdownLinks(
    documentId: string,
    documentVersion: KnowledgeDocumentVersion,
  ): Promise<KnowledgeMarkdownLink[]> {
    const response = await invokeUnary(
      this.options.sessionToken,
      this.clients.markdown,
      this.clients.markdown.getLinks,
      {
        documentId,
        documentVersion: versionToProto(documentVersion),
      },
    )
    return response.links
  }

  search(query: string, limit: number): Promise<FsSearchResult[]> {
    return this.searchWithOptions(query, { limit }).then((result) => result.results)
  }

  searchWithOptions(
    query: string,
    options: KnowledgeSearchOptions = {},
  ): Promise<KnowledgeSearchResultSet> {
    return runSearchWithOptions(
      this.options.sessionToken,
      this.clients.searchClient,
      query,
      options,
    )
  }

  async shutdown(reason: string): Promise<void> {
    await invokeUnary(
      this.options.sessionToken,
      this.clients.control,
      this.clients.control.shutdown,
      { reason },
    )
  }

  close(): void {
    this.clients.control.close()
    this.clients.documentSession.close()
    this.clients.markdown.close()
    this.clients.workspace.close()
    this.clients.workspaceVfs.close()
    this.clients.searchClient.close()
  }
}

const versionToProto = (version: KnowledgeDocumentVersion): string => String(version)
