import { Buffer } from 'node:buffer'

import {
  ChannelCredentials,
  Client,
  type ClientOptions,
  type ClientReadableStream,
  type ClientUnaryCall,
  type Metadata,
  makeGenericClientConstructor,
  Metadata as GrpcMetadata,
  type ServiceError,
} from '@grpc/grpc-js'

import type { FsSearchResult } from '@electron/services/workspace/types.js'
import {
  CloseWorkspaceRequest,
  CloseWorkspaceResponse,
  GetCapabilitiesRequest,
  GetCapabilitiesResponse,
  HasDocumentsRequest,
  HasDocumentsResponse,
  OpenWorkspaceRequest,
  OpenWorkspaceResponse,
  RebuildIndexRequest,
  RebuildIndexResponse,
  RemoveDocumentRequest,
  RemoveDocumentResponse,
  RemovePathPrefixRequest,
  RemovePathPrefixResponse,
  SearchRequest,
  SearchResponse,
  ShutdownRequest,
  ShutdownResponse,
  UpsertDocumentRequest,
  UpsertDocumentResponse,
  type WorkspaceDocument,
} from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'

type MessageCodec<T> = {
  decode: (input: Uint8Array) => T
  encode: (message: T) => { finish: () => Uint8Array }
}

type UnaryCall<Request, Response> = (
  request: Request,
  metadata: Metadata,
  callback: (error: ServiceError | null, response: Response) => void,
) => ClientUnaryCall

type ServerStreamingCall<Request, Response> = (
  request: Request,
  metadata: Metadata,
) => ClientReadableStream<Response>

type ControlClient = Client & {
  getCapabilities: UnaryCall<GetCapabilitiesRequest, GetCapabilitiesResponse>
  shutdown: UnaryCall<ShutdownRequest, ShutdownResponse>
}

type WorkspaceClient = Client & {
  closeWorkspace: UnaryCall<CloseWorkspaceRequest, CloseWorkspaceResponse>
  hasDocuments: UnaryCall<HasDocumentsRequest, HasDocumentsResponse>
  openWorkspace: UnaryCall<OpenWorkspaceRequest, OpenWorkspaceResponse>
  rebuildIndex: UnaryCall<RebuildIndexRequest, RebuildIndexResponse>
  removeDocument: UnaryCall<RemoveDocumentRequest, RemoveDocumentResponse>
  removePathPrefix: UnaryCall<RemovePathPrefixRequest, RemovePathPrefixResponse>
  upsertDocument: UnaryCall<UpsertDocumentRequest, UpsertDocumentResponse>
}

type SearchClient = Client & {
  search: ServerStreamingCall<SearchRequest, SearchResponse>
}

type KnowledgeEngineGrpcClientOptions = {
  address: string
  sessionToken: string
  clientOptions?: Partial<ClientOptions>
}

export class KnowledgeEngineGrpcClient {
  private readonly control: ControlClient
  private readonly workspace: WorkspaceClient
  private readonly searchClient: SearchClient

  constructor(private readonly options: KnowledgeEngineGrpcClientOptions) {
    const credentials = ChannelCredentials.createInsecure()
    this.control = new ControlClientConstructor(options.address, credentials, options.clientOptions)
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

  private metadata(): Metadata {
    const metadata = new GrpcMetadata()
    metadata.set('x-marklab-session-token', this.options.sessionToken)
    return metadata
  }
}

const serialize =
  <T>(codec: MessageCodec<T>) =>
  (value: T): Buffer => {
    const bytes = codec.encode(value).finish()
    const fromBytes = Buffer.from as unknown as (value: Uint8Array) => Buffer
    return fromBytes(bytes)
  }

const deserialize =
  <T>(codec: MessageCodec<T>) =>
  (value: Buffer): T =>
    codec.decode(new Uint8Array(value))

const unaryDefinition = <Request, Response>(
  path: string,
  requestCodec: MessageCodec<Request>,
  responseCodec: MessageCodec<Response>,
) => ({
  path,
  requestDeserialize: deserialize(requestCodec),
  requestSerialize: serialize(requestCodec),
  requestStream: false,
  responseDeserialize: deserialize(responseCodec),
  responseSerialize: serialize(responseCodec),
  responseStream: false,
})

const serverStreamDefinition = <Request, Response>(
  path: string,
  requestCodec: MessageCodec<Request>,
  responseCodec: MessageCodec<Response>,
) => ({
  path,
  requestDeserialize: deserialize(requestCodec),
  requestSerialize: serialize(requestCodec),
  requestStream: false,
  responseDeserialize: deserialize(responseCodec),
  responseSerialize: serialize(responseCodec),
  responseStream: true,
})

const ControlClientConstructor = makeGenericClientConstructor(
  {
    getCapabilities: unaryDefinition(
      '/knowledge.engine.v1.ControlService/GetCapabilities',
      GetCapabilitiesRequest,
      GetCapabilitiesResponse,
    ),
    shutdown: unaryDefinition(
      '/knowledge.engine.v1.ControlService/Shutdown',
      ShutdownRequest,
      ShutdownResponse,
    ),
  },
  'knowledge.engine.v1.ControlService',
) as unknown as new (
  address: string,
  credentials: ChannelCredentials,
  options?: Partial<ClientOptions>,
) => ControlClient

const WorkspaceClientConstructor = makeGenericClientConstructor(
  {
    closeWorkspace: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceService/CloseWorkspace',
      CloseWorkspaceRequest,
      CloseWorkspaceResponse,
    ),
    hasDocuments: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceService/HasDocuments',
      HasDocumentsRequest,
      HasDocumentsResponse,
    ),
    openWorkspace: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceService/OpenWorkspace',
      OpenWorkspaceRequest,
      OpenWorkspaceResponse,
    ),
    rebuildIndex: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceService/RebuildIndex',
      RebuildIndexRequest,
      RebuildIndexResponse,
    ),
    removeDocument: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceService/RemoveDocument',
      RemoveDocumentRequest,
      RemoveDocumentResponse,
    ),
    removePathPrefix: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceService/RemovePathPrefix',
      RemovePathPrefixRequest,
      RemovePathPrefixResponse,
    ),
    upsertDocument: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceService/UpsertDocument',
      UpsertDocumentRequest,
      UpsertDocumentResponse,
    ),
  },
  'knowledge.engine.v1.WorkspaceService',
) as unknown as new (
  address: string,
  credentials: ChannelCredentials,
  options?: Partial<ClientOptions>,
) => WorkspaceClient

const SearchClientConstructor = makeGenericClientConstructor(
  {
    search: serverStreamDefinition(
      '/knowledge.engine.v1.SearchService/Search',
      SearchRequest,
      SearchResponse,
    ),
  },
  'knowledge.engine.v1.SearchService',
) as unknown as new (
  address: string,
  credentials: ChannelCredentials,
  options?: Partial<ClientOptions>,
) => SearchClient

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
