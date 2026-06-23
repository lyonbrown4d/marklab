import {
  ChannelCredentials,
  Client,
  type ClientOptions,
  type Metadata,
  Metadata as GrpcMetadata,
} from '@grpc/grpc-js'

import type { FsSearchResult } from '@electron/services/workspace/types.js'
import type {
  ApplyDocumentChange,
  CloseDocument,
  MarkdownDocumentSymbol,
  MarkdownLink,
  OpenDocument,
  ResyncDocument,
  SearchResponse,
  SyncRequest,
  SyncResponse,
  TextEdit,
  WorkspaceDocument,
} from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'
import {
  ControlClientConstructor,
  DocumentSessionClientConstructor,
  MarkdownClientConstructor,
  SearchClientConstructor,
  WorkspaceClientConstructor,
  type ControlClient,
  type DocumentSessionClient,
  type KnowledgeEngineGrpcClients,
  type MarkdownClient,
  type SearchClient,
  type UnaryCall,
  type WorkspaceClient,
} from '@electron/services/knowledgeEngine/grpcWire.js'

type KnowledgeEngineGrpcClientOptions = {
  address: string
  sessionToken: string
  clientOptions?: Partial<ClientOptions>
  clients?: KnowledgeEngineGrpcClients
}

type KnowledgeDocumentVersion = number | string

export type KnowledgeOpenDocumentInput = Omit<OpenDocument, 'version'> & {
  version: KnowledgeDocumentVersion
}

export type KnowledgeDocumentChangeInput = Omit<ApplyDocumentChange, 'baseVersion' | 'version'> & {
  baseVersion: KnowledgeDocumentVersion
  version: KnowledgeDocumentVersion
}

export type KnowledgeResyncDocumentInput = Omit<ResyncDocument, 'version'> & {
  version: KnowledgeDocumentVersion
}

export type KnowledgeCloseDocumentInput = CloseDocument
export type KnowledgeMarkdownDocumentSymbol = MarkdownDocumentSymbol
export type KnowledgeMarkdownLink = MarkdownLink
export type KnowledgeSyncResponse = SyncResponse
export type KnowledgeTextEdit = TextEdit

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
    this.control = new ControlClientConstructor(options.address, credentials, options.clientOptions)
    this.documentSession = new DocumentSessionClientConstructor(
      options.address,
      credentials,
      options.clientOptions,
    )
    this.markdown = new MarkdownClientConstructor(
      options.address,
      credentials,
      options.clientOptions,
    )
    this.workspace = new WorkspaceClientConstructor(
      options.address,
      credentials,
      options.clientOptions,
    )
    this.searchClient = new SearchClientConstructor(
      options.address,
      credentials,
      options.clientOptions,
    )
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
    const stream = this.searchClient.search({ query, limit }, this.metadata())
    const results: FsSearchResult[] = []

    return new Promise((resolve, reject) => {
      stream.on('data', (response: SearchResponse) => {
        results.push(...response.results.map(searchResultToFsResult))
      })
      stream.once('error', reject)
      stream.once('end', () => resolve(results))
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

const searchResultToFsResult = (result: SearchResponse['results'][number]): FsSearchResult => ({
  column: Math.max(result.column, 1),
  end_column: Math.max(result.endColumn, 1),
  line: Math.max(result.line, 1),
  path: result.path,
  score: result.score,
  snippet: result.snippet,
  snippet_highlights: result.snippetHighlights.map((highlight) => ({
    end: highlight.end,
    start: highlight.start,
  })),
  title: result.title || result.path,
})
