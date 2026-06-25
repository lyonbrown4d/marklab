/* eslint-disable max-lines */
import { EventEmitter } from 'node:events'

import {
  Metadata,
  type ClientDuplexStream,
  type ClientReadableStream,
  type ClientUnaryCall,
  type ServiceError,
} from '@grpc/grpc-js'
import { vi } from 'vitest'

import { KnowledgeEngineGrpcClient } from '@electron/services/knowledgeEngine/grpcClient.js'
import type {
  CloseWorkspaceRequest,
  CloseWorkspaceResponse,
  GetCapabilitiesRequest,
  GetCapabilitiesResponse,
  GetDocumentSymbolsRequest,
  GetDocumentSymbolsResponse,
  GetLinksRequest,
  GetLinksResponse,
  CreateWorkspaceDirectoryRequest,
  CreateWorkspaceFileRequest,
  DeleteWorkspacePathRequest,
  GetWorkspaceFileSnapshotRequest,
  GetWorkspaceFileSnapshotResponse,
  GetWorkspacePathMetadataRequest,
  GetWorkspacePathMetadataResponse,
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
  WriteWorkspaceFileRequest,
  WorkspacePathMutationResponse,
} from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'

type RecordedCall = {
  metadata: Metadata
  request: unknown
}

type CallKey =
  | 'closeWorkspace'
  | 'createDirectory'
  | 'createFile'
  | 'deletePath'
  | 'getCapabilities'
  | 'getDocumentSymbols'
  | 'getLinks'
  | 'getPathMetadata'
  | 'getSnapshot'
  | 'hasDocuments'
  | 'listEntries'
  | 'openWorkspace'
  | 'rebuildIndex'
  | 'removeDocument'
  | 'readFile'
  | 'renamePath'
  | 'removePathPrefix'
  | 'search'
  | 'shutdown'
  | 'sync'
  | 'upsertDocument'
  | 'writeFile'

export type ClientFixture = {
  calls: Partial<Record<CallKey, RecordedCall>>
  close: {
    control: ReturnType<typeof vi.fn>
    documentSession: ReturnType<typeof vi.fn>
    markdown: ReturnType<typeof vi.fn>
    searchClient: ReturnType<typeof vi.fn>
    workspace: ReturnType<typeof vi.fn>
    workspaceVfs: ReturnType<typeof vi.fn>
  }
  createClient: () => KnowledgeEngineGrpcClient
}

export const createClientFixture = (): ClientFixture => {
  const calls: ClientFixture['calls'] = {}
  const close = {
    control: vi.fn(),
    documentSession: vi.fn(),
    markdown: vi.fn(),
    searchClient: vi.fn(),
    workspace: vi.fn(),
    workspaceVfs: vi.fn(),
  }

  return {
    calls,
    close,
    createClient: () =>
      new KnowledgeEngineGrpcClient({
        address: '127.0.0.1:40101',
        clients: {
          control: {
            close: close.control,
            getCapabilities: unary<GetCapabilitiesRequest, GetCapabilitiesResponse>(
              calls,
              'getCapabilities',
              {} as GetCapabilitiesResponse,
            ),
            shutdown: unary<ShutdownRequest, ShutdownResponse>(
              calls,
              'shutdown',
              {} as ShutdownResponse,
            ),
          },
          documentSession: {
            close: close.documentSession,
            sync: (metadata: Metadata) => createSyncStream(calls, metadata),
          },
          markdown: {
            close: close.markdown,
            getDocumentSymbols: unary<GetDocumentSymbolsRequest, GetDocumentSymbolsResponse>(
              calls,
              'getDocumentSymbols',
              {
                symbols: [
                  {
                    kind: 12,
                    level: 1,
                    name: 'Alpha',
                    range: undefined,
                    slug: 'alpha',
                  },
                ],
              },
            ),
            getLinks: unary<GetLinksRequest, GetLinksResponse>(calls, 'getLinks', {
              links: [
                {
                  isExternal: false,
                  range: undefined,
                  sourceDocumentId: 'alpha.md',
                  target: 'beta.md',
                  text: 'Beta',
                },
              ],
            }),
          },
          searchClient: {
            close: close.searchClient,
            search: (request: SearchRequest, metadata: Metadata) => {
              calls.search = { metadata, request }
              const stream = new EventEmitter() as ClientReadableStream<SearchResponse>
              queueMicrotask(() => {
                stream.emit('data', {
                  done: true,
                  results: [
                    {
                      column: 0,
                      endColumn: 7,
                      line: 3,
                      path: 'alpha.md',
                      score: 0.75,
                      snippet: 'Alpha body',
                      snippetHighlights: [{ end: 5, start: 0 }],
                      title: 'Alpha',
                    },
                  ],
                  totalHits: 1,
                })
                stream.emit('end')
              })
              return stream
            },
          },
          workspaceVfs: {
            close: close.workspaceVfs,
            createDirectory: unary<CreateWorkspaceDirectoryRequest, WorkspacePathMutationResponse>(
              calls,
              'createDirectory',
              { changed: true, kind: 1, ok: true },
            ),
            createFile: unary<CreateWorkspaceFileRequest, WorkspacePathMutationResponse>(
              calls,
              'createFile',
              { changed: true, kind: 1, ok: true },
            ),
            deletePath: unary<DeleteWorkspacePathRequest, WorkspacePathMutationResponse>(
              calls,
              'deletePath',
              { changed: true, kind: 1, ok: true },
            ),
            getPathMetadata: unary<
              GetWorkspacePathMetadataRequest,
              GetWorkspacePathMetadataResponse
            >(calls, 'getPathMetadata', {
              absolutePath: 'D:/workspace/alpha.md',
              kind: 1,
              modifiedMs: 100,
              path: 'alpha.md',
              readonly: false,
              sizeBytes: '7',
            }),
            getSnapshot: unary<GetWorkspaceFileSnapshotRequest, GetWorkspaceFileSnapshotResponse>(
              calls,
              'getSnapshot',
              { entries: [{ kind: 1, name: 'alpha.md', path: 'alpha.md' }] },
            ),
            listEntries: unary<ListWorkspaceEntriesRequest, ListWorkspaceEntriesResponse>(
              calls,
              'listEntries',
              { entries: [{ kind: 1, name: 'alpha.md', path: 'alpha.md' }] },
            ),
            readFile: unary<ReadWorkspaceFileRequest, ReadWorkspaceFileResponse>(
              calls,
              'readFile',
              { content: '# Alpha' },
            ),
            renamePath: unary<RenameWorkspacePathRequest, WorkspacePathMutationResponse>(
              calls,
              'renamePath',
              { changed: true, kind: 1, ok: true },
            ),
            writeFile: unary<WriteWorkspaceFileRequest, WorkspacePathMutationResponse>(
              calls,
              'writeFile',
              { changed: true, kind: 1, ok: true },
            ),
          },
          workspace: {
            close: close.workspace,
            closeWorkspace: unary<CloseWorkspaceRequest, CloseWorkspaceResponse>(
              calls,
              'closeWorkspace',
              {} as CloseWorkspaceResponse,
            ),
            hasDocuments: unary(calls, 'hasDocuments', { hasDocuments: true }),
            openWorkspace: unary<OpenWorkspaceRequest, OpenWorkspaceResponse>(
              calls,
              'openWorkspace',
              {} as OpenWorkspaceResponse,
            ),
            rebuildIndex: unary<RebuildIndexRequest, RebuildIndexResponse>(
              calls,
              'rebuildIndex',
              {} as RebuildIndexResponse,
            ),
            removeDocument: unary<RemoveDocumentRequest, RemoveDocumentResponse>(
              calls,
              'removeDocument',
              {} as RemoveDocumentResponse,
            ),
            removePathPrefix: unary<RemovePathPrefixRequest, RemovePathPrefixResponse>(
              calls,
              'removePathPrefix',
              {} as RemovePathPrefixResponse,
            ),
            upsertDocument: unary<UpsertDocumentRequest, UpsertDocumentResponse>(
              calls,
              'upsertDocument',
              {} as UpsertDocumentResponse,
            ),
          },
        } as unknown as NonNullable<
          ConstructorParameters<typeof KnowledgeEngineGrpcClient>[0]['clients']
        >,
        sessionToken: 'session-token-a',
      }),
  }
}

const createSyncStream = (
  calls: ClientFixture['calls'],
  metadata: Metadata,
): ClientDuplexStream<SyncRequest, SyncResponse> => {
  const stream = new EventEmitter() as ClientDuplexStream<SyncRequest, SyncResponse>
  Object.assign(stream, {
    end: vi.fn(),
    write: vi.fn((request: SyncRequest) => {
      calls.sync = { metadata, request }
      queueMicrotask(() => {
        stream.emit('data', acknowledgedFromSyncRequest(request))
        stream.emit('end')
      })
      return true
    }),
  })
  return stream
}

const acknowledgedFromSyncRequest = (request: SyncRequest): SyncResponse => {
  const event = request.open ?? request.change ?? request.resync ?? request.close
  return {
    acknowledged: {
      documentId: event?.documentId ?? '',
      version: request.open?.version ?? request.change?.version ?? request.resync?.version ?? '0',
    },
  }
}

const unary =
  <Request, Response>(calls: ClientFixture['calls'], key: CallKey, response: Response) =>
  (
    request: Request,
    metadata: Metadata,
    callback: (error: ServiceError | null, response: Response) => void,
  ) => {
    calls[key] = { metadata, request }
    callback(null, response)
    return {} as ClientUnaryCall
  }
