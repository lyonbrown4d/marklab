/* eslint-disable max-lines */
import { Buffer } from 'node:buffer'

import {
  ChannelCredentials,
  Client,
  type ClientDuplexStream,
  type ClientOptions,
  type ClientReadableStream,
  type ClientUnaryCall,
  type Metadata,
  makeGenericClientConstructor,
  type ServiceError,
} from '@grpc/grpc-js'

import {
  CloseWorkspaceRequest,
  CreateWorkspaceDirectoryRequest,
  CreateWorkspaceFileRequest,
  DeleteWorkspacePathRequest,
  CloseWorkspaceResponse,
  GetCapabilitiesRequest,
  GetCapabilitiesResponse,
  GetDocumentSymbolsRequest,
  GetDocumentSymbolsResponse,
  GetLinksRequest,
  GetLinksResponse,
  GetWorkspaceStatusRequest,
  GetWorkspaceStatusResponse,
  GetWorkspaceFileSnapshotRequest,
  GetWorkspaceFileSnapshotResponse,
  GetWorkspacePathMetadataRequest,
  GetWorkspacePathMetadataResponse,
  HasDocumentsRequest,
  HasDocumentsResponse,
  ListWorkspaceEntriesRequest,
  ListWorkspaceEntriesResponse,
  OpenWorkspaceRequest,
  OpenWorkspaceResponse,
  RebuildIndexRequest,
  RebuildIndexResponse,
  RemoveDocumentRequest,
  RemoveDocumentResponse,
  RemovePathPrefixRequest,
  RemovePathPrefixResponse,
  ReadWorkspaceFileRequest,
  RenameWorkspacePathRequest,
  ReadWorkspaceFileResponse,
  SearchRequest,
  SearchResponse,
  ShutdownRequest,
  ShutdownResponse,
  SyncRequest,
  SyncResponse,
  UpsertDocumentRequest,
  UpsertDocumentResponse,
  WorkspacePathMutationResponse,
} from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'

type MessageCodec<T> = {
  decode: (input: Uint8Array) => T
  encode: (message: T) => { finish: () => Uint8Array }
}

export type UnaryCall<Request, Response> = (
  request: Request,
  metadata: Metadata,
  callback: (error: ServiceError | null, response: Response) => void,
) => ClientUnaryCall

type ServerStreamingCall<Request, Response> = (
  request: Request,
  metadata: Metadata,
) => ClientReadableStream<Response>

type DuplexStreamingCall<Request, Response> = (
  metadata: Metadata,
) => ClientDuplexStream<Request, Response>

export type ControlClient = Client & {
  getCapabilities: UnaryCall<GetCapabilitiesRequest, GetCapabilitiesResponse>
  shutdown: UnaryCall<ShutdownRequest, ShutdownResponse>
}

export type DocumentSessionClient = Client & {
  sync: DuplexStreamingCall<SyncRequest, SyncResponse>
}

export type MarkdownClient = Client & {
  getDocumentSymbols: UnaryCall<GetDocumentSymbolsRequest, GetDocumentSymbolsResponse>
  getLinks: UnaryCall<GetLinksRequest, GetLinksResponse>
}

export type WorkspaceVfsClient = Client & {
  createDirectory: UnaryCall<CreateWorkspaceDirectoryRequest, WorkspacePathMutationResponse>
  createFile: UnaryCall<CreateWorkspaceFileRequest, WorkspacePathMutationResponse>
  deletePath: UnaryCall<DeleteWorkspacePathRequest, WorkspacePathMutationResponse>
  getSnapshot: UnaryCall<GetWorkspaceFileSnapshotRequest, GetWorkspaceFileSnapshotResponse>
  getPathMetadata: UnaryCall<GetWorkspacePathMetadataRequest, GetWorkspacePathMetadataResponse>
  listEntries: UnaryCall<ListWorkspaceEntriesRequest, ListWorkspaceEntriesResponse>
  readFile: UnaryCall<ReadWorkspaceFileRequest, ReadWorkspaceFileResponse>
  renamePath: UnaryCall<RenameWorkspacePathRequest, WorkspacePathMutationResponse>
}
export type WorkspaceClient = Client & {
  closeWorkspace: UnaryCall<CloseWorkspaceRequest, CloseWorkspaceResponse>
  getWorkspaceStatus: UnaryCall<GetWorkspaceStatusRequest, GetWorkspaceStatusResponse>
  hasDocuments: UnaryCall<HasDocumentsRequest, HasDocumentsResponse>
  openWorkspace: UnaryCall<OpenWorkspaceRequest, OpenWorkspaceResponse>
  rebuildIndex: UnaryCall<RebuildIndexRequest, RebuildIndexResponse>
  removeDocument: UnaryCall<RemoveDocumentRequest, RemoveDocumentResponse>
  removePathPrefix: UnaryCall<RemovePathPrefixRequest, RemovePathPrefixResponse>
  upsertDocument: UnaryCall<UpsertDocumentRequest, UpsertDocumentResponse>
}

export type SearchClient = Client & {
  search: ServerStreamingCall<SearchRequest, SearchResponse>
}

export type KnowledgeEngineGrpcClients = {
  control: ControlClient
  documentSession: DocumentSessionClient
  markdown: MarkdownClient
  searchClient: SearchClient
  workspace: WorkspaceClient
  workspaceVfs: WorkspaceVfsClient
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

const duplexStreamDefinition = <Request, Response>(
  path: string,
  requestCodec: MessageCodec<Request>,
  responseCodec: MessageCodec<Response>,
) => ({
  path,
  requestDeserialize: deserialize(requestCodec),
  requestSerialize: serialize(requestCodec),
  requestStream: true,
  responseDeserialize: deserialize(responseCodec),
  responseSerialize: serialize(responseCodec),
  responseStream: true,
})

export const ControlClientConstructor = makeGenericClientConstructor(
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

export const DocumentSessionClientConstructor = makeGenericClientConstructor(
  {
    sync: duplexStreamDefinition(
      '/knowledge.engine.v1.DocumentSessionService/Sync',
      SyncRequest,
      SyncResponse,
    ),
  },
  'knowledge.engine.v1.DocumentSessionService',
) as unknown as new (
  address: string,
  credentials: ChannelCredentials,
  options?: Partial<ClientOptions>,
) => DocumentSessionClient

export const MarkdownClientConstructor = makeGenericClientConstructor(
  {
    getDocumentSymbols: unaryDefinition(
      '/knowledge.engine.v1.MarkdownService/GetDocumentSymbols',
      GetDocumentSymbolsRequest,
      GetDocumentSymbolsResponse,
    ),
    getLinks: unaryDefinition(
      '/knowledge.engine.v1.MarkdownService/GetLinks',
      GetLinksRequest,
      GetLinksResponse,
    ),
  },
  'knowledge.engine.v1.MarkdownService',
) as unknown as new (
  address: string,
  credentials: ChannelCredentials,
  options?: Partial<ClientOptions>,
) => MarkdownClient

export const WorkspaceVfsClientConstructor = makeGenericClientConstructor(
  {
    createDirectory: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceVfsService/CreateDirectory',
      CreateWorkspaceDirectoryRequest,
      WorkspacePathMutationResponse,
    ),
    createFile: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceVfsService/CreateFile',
      CreateWorkspaceFileRequest,
      WorkspacePathMutationResponse,
    ),
    deletePath: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceVfsService/DeletePath',
      DeleteWorkspacePathRequest,
      WorkspacePathMutationResponse,
    ),
    getSnapshot: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceVfsService/GetSnapshot',
      GetWorkspaceFileSnapshotRequest,
      GetWorkspaceFileSnapshotResponse,
    ),
    getPathMetadata: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceVfsService/GetPathMetadata',
      GetWorkspacePathMetadataRequest,
      GetWorkspacePathMetadataResponse,
    ),
    listEntries: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceVfsService/ListEntries',
      ListWorkspaceEntriesRequest,
      ListWorkspaceEntriesResponse,
    ),
    readFile: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceVfsService/ReadFile',
      ReadWorkspaceFileRequest,
      ReadWorkspaceFileResponse,
    ),
    renamePath: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceVfsService/RenamePath',
      RenameWorkspacePathRequest,
      WorkspacePathMutationResponse,
    ),
  },
  'knowledge.engine.v1.WorkspaceVfsService',
) as unknown as new (
  address: string,
  credentials: ChannelCredentials,
  options?: Partial<ClientOptions>,
) => WorkspaceVfsClient

export const WorkspaceClientConstructor = makeGenericClientConstructor(
  {
    closeWorkspace: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceService/CloseWorkspace',
      CloseWorkspaceRequest,
      CloseWorkspaceResponse,
    ),
    getWorkspaceStatus: unaryDefinition(
      '/knowledge.engine.v1.WorkspaceService/GetWorkspaceStatus',
      GetWorkspaceStatusRequest,
      GetWorkspaceStatusResponse,
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

export const SearchClientConstructor = makeGenericClientConstructor(
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
