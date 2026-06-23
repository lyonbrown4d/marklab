import { ChannelCredentials, Client, type Metadata, Metadata as GrpcMetadata } from '@grpc/grpc-js'

import type { FsSearchResult } from '@electron/services/workspace/types.js'
import type {
  SearchRequest,
  SearchResponse,
  SyncRequest,
  SyncResponse,
  WorkspaceDocument,
} from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'
import type {
  KnowledgeCloseDocumentInput,
  KnowledgeDocumentChangeInput,
  KnowledgeDocumentVersion,
  KnowledgeMarkdownDocumentSymbol,
  KnowledgeMarkdownLink,
  KnowledgeOpenDocumentInput,
  KnowledgeResyncDocumentInput,
  KnowledgeSyncResponse,
  KnowledgeEngineGrpcClientOptions,
} from '@electron/services/knowledgeEngine/knowledgeEngineTypes.js'
import {
  ControlClientConstructor,
  DocumentSessionClientConstructor,
  MarkdownClientConstructor,
  SearchClientConstructor,
  WorkspaceClientConstructor,
  type ControlClient,
  type DocumentSessionClient,
  type MarkdownClient,
  type SearchClient,
  type UnaryCall,
  type WorkspaceClient,
} from '@electron/services/knowledgeEngine/grpcWire.js'
import {
  knowledgeSearchOrderToProto,
  searchLimitValue,
  searchResultToFsResult,
  type KnowledgeSearchOptions,
  type KnowledgeSearchResultSet,
} from '@electron/services/knowledgeEngine/knowledgeSearch.js'
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
  KnowledgeResyncDocumentInput,
  KnowledgeSyncResponse,
  KnowledgeEngineGrpcClientOptions,
} from '@electron/services/knowledgeEngine/knowledgeEngineTypes.js'
export class KnowledgeEngineGrpcClient {
  private readonly control: ControlClient
  private readonly documentSession: DocumentSessionClient
  private readonly markdown: MarkdownClient
  private readonly workspace: WorkspaceClient
  private readonly searchClient: SearchClient

  constructor(private readonly options: KnowledgeEngineGrpcClientOptions) {
    if (options.clients) {
      this.control = options.clients.control
      this.documentSession = options.clients.documentSession
      this.markdown = options.clients.markdown
      this.workspace = options.clients.workspace
      this.searchClient = options.clients.searchClient
      return
    }

    const credentials = ChannelCredentials.createInsecure()
    const clientOptions = {
      'grpc.enable_http_proxy': 0,
      ...options.clientOptions,
    }
    this.control = new ControlClientConstructor(options.address, credentials, clientOptions)
    this.documentSession = new DocumentSessionClientConstructor(
      options.address,
      credentials,
      clientOptions,
    )
    this.markdown = new MarkdownClientConstructor(options.address, credentials, clientOptions)
    this.workspace = new WorkspaceClientConstructor(options.address, credentials, clientOptions)
    this.searchClient = new SearchClientConstructor(options.address, credentials, clientOptions)
  }

  getCapabilities(workspaceInstanceId: string) {
    return this.unary(this.control, this.control.getCapabilities, { workspaceInstanceId })
  }

  async openWorkspace(indexPath: string): Promise<void> {
    await this.unary(this.workspace, this.workspace.openWorkspace, { indexPath })
  }

  async closeWorkspace(): Promise<void> {
    await this.unary(this.workspace, this.workspace.closeWorkspace, {})
  }

  async hasDocuments(): Promise<boolean> {
    const response = await this.unary(this.workspace, this.workspace.hasDocuments, {})
    return response.hasDocuments
  }

  async rebuildIndex(documents: WorkspaceDocument[]): Promise<void> {
    await this.unary(this.workspace, this.workspace.rebuildIndex, { documents })
  }

  async upsertDocument(document: WorkspaceDocument): Promise<void> {
    await this.unary(this.workspace, this.workspace.upsertDocument, { document })
  }

  async removeDocument(path: string): Promise<void> {
    await this.unary(this.workspace, this.workspace.removeDocument, { path })
  }

  async removePathPrefix(prefix: string): Promise<void> {
    await this.unary(this.workspace, this.workspace.removePathPrefix, { prefix })
  }

  openMarkdownDocument(
    workspaceInstanceId: string,
    document: KnowledgeOpenDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    return this.syncOnce({
      open: { ...document, version: versionToProto(document.version) },
      workspaceInstanceId,
    })
  }

  changeMarkdownDocument(
    workspaceInstanceId: string,
    change: KnowledgeDocumentChangeInput,
  ): Promise<KnowledgeSyncResponse> {
    return this.syncOnce({
      change: {
        ...change,
        baseVersion: versionToProto(change.baseVersion),
        version: versionToProto(change.version),
      },
      workspaceInstanceId,
    })
  }

  closeMarkdownDocument(
    workspaceInstanceId: string,
    document: KnowledgeCloseDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    return this.syncOnce({ close: document, workspaceInstanceId })
  }

  resyncMarkdownDocument(
    workspaceInstanceId: string,
    document: KnowledgeResyncDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    return this.syncOnce({
      resync: { ...document, version: versionToProto(document.version) },
      workspaceInstanceId,
    })
  }

  async getMarkdownDocumentSymbols(
    documentId: string,
    documentVersion: KnowledgeDocumentVersion,
  ): Promise<KnowledgeMarkdownDocumentSymbol[]> {
    const response = await this.unary(this.markdown, this.markdown.getDocumentSymbols, {
      documentId,
      documentVersion: versionToProto(documentVersion),
    })
    return response.symbols
  }

  async getMarkdownLinks(
    documentId: string,
    documentVersion: KnowledgeDocumentVersion,
  ): Promise<KnowledgeMarkdownLink[]> {
    const response = await this.unary(this.markdown, this.markdown.getLinks, {
      documentId,
      documentVersion: versionToProto(documentVersion),
    })
    return response.links
  }

  search(query: string, limit: number): Promise<FsSearchResult[]> {
    return this.searchWithOptions(query, { limit }).then((result) => result.results)
  }

  searchWithOptions(
    query: string,
    options: KnowledgeSearchOptions = {},
  ): Promise<KnowledgeSearchResultSet> {
    const request: SearchRequest = {
      query,
      limit: searchLimitValue(options.limit),
      includePaths: options.includePaths ?? [],
      offset: Math.max(0, options.offset ?? 0),
      order: knowledgeSearchOrderToProto(options.order),
      includeTotalHits: options.includeTotalHits ?? false,
      includeDiagnostics: options.includeDiagnostics ?? false,
    }

    const stream = this.searchClient.search(request, this.metadata())
    const resultSet: KnowledgeSearchResultSet = {
      results: [],
      totalHits: 0,
      diagnostics: undefined,
    }

    return new Promise((resolve, reject) => {
      stream.on('data', (response: SearchResponse) => {
        if (response.results?.length) {
          resultSet.results.push(...response.results.map(searchResultToFsResult))
        }
        if (typeof response.totalHits === 'number') {
          resultSet.totalHits = response.totalHits
        }
        if (response.diagnostics) {
          resultSet.diagnostics = {
            elapsedMs: Number(response.diagnostics.elapsedMs),
            returnedHits: response.diagnostics.returnedHits,
            totalHits: response.diagnostics.totalHits,
            offset: response.diagnostics.offset,
            limit: response.diagnostics.limit,
          }
        }
      })
      stream.once('error', reject)
      stream.once('end', () => resolve(resultSet))
    })
  }

  async shutdown(reason: string): Promise<void> {
    await this.unary(this.control, this.control.shutdown, { reason })
  }

  close(): void {
    this.control.close()
    this.documentSession.close()
    this.markdown.close()
    this.workspace.close()
    this.searchClient.close()
  }

  private unary<Request, Response>(
    client: Client,
    call: UnaryCall<Request, Response>,
    request: Request,
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      call.call(client, request, this.metadata(), (error, response) => {
        if (error) {
          reject(error)
          return
        }

        resolve(response)
      })
    })
  }

  private syncOnce(request: SyncRequest): Promise<SyncResponse> {
    const stream = this.documentSession.sync(this.metadata())

    return new Promise((resolve, reject) => {
      let settled = false

      const resolveOnce = (response: SyncResponse) => {
        if (settled) return
        settled = true
        resolve(response)
      }
      const rejectOnce = (error: Error) => {
        if (settled) return
        settled = true
        reject(error)
      }

      stream.once('data', resolveOnce)
      stream.once('error', rejectOnce)
      stream.once('end', () => {
        rejectOnce(new Error('Knowledge document sync ended without a response.'))
      })
      stream.write(request)
      stream.end()
    })
  }

  private metadata(): Metadata {
    const metadata = new GrpcMetadata()
    metadata.set('x-marklab-session-token', this.options.sessionToken)
    return metadata
  }
}

const versionToProto = (version: KnowledgeDocumentVersion): string => String(version)
