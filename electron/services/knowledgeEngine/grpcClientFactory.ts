import { ChannelCredentials } from '@grpc/grpc-js'

import type { KnowledgeEngineGrpcClientOptions } from '@electron/services/knowledgeEngine/knowledgeEngineTypes.js'
import {
  ControlClientConstructor,
  DocumentSessionClientConstructor,
  MarkdownClientConstructor,
  SearchClientConstructor,
  WorkspaceClientConstructor,
  WorkspaceVfsClientConstructor,
  type ControlClient,
  type DocumentSessionClient,
  type MarkdownClient,
  type SearchClient,
  type WorkspaceClient,
  type WorkspaceVfsClient,
} from '@electron/services/knowledgeEngine/grpcWire.js'

export type KnowledgeEngineGrpcClients = {
  control: ControlClient
  documentSession: DocumentSessionClient
  markdown: MarkdownClient
  workspace: WorkspaceClient
  workspaceVfs: WorkspaceVfsClient
  searchClient: SearchClient
}

export const createKnowledgeEngineGrpcClients = (
  options: KnowledgeEngineGrpcClientOptions,
): KnowledgeEngineGrpcClients => {
  if (options.clients) return options.clients

  const credentials = ChannelCredentials.createInsecure()
  const clientOptions = {
    'grpc.enable_http_proxy': 0,
    ...options.clientOptions,
  }

  return {
    control: new ControlClientConstructor(options.address, credentials, clientOptions),
    documentSession: new DocumentSessionClientConstructor(
      options.address,
      credentials,
      clientOptions,
    ),
    markdown: new MarkdownClientConstructor(options.address, credentials, clientOptions),
    searchClient: new SearchClientConstructor(options.address, credentials, clientOptions),
    workspace: new WorkspaceClientConstructor(options.address, credentials, clientOptions),
    workspaceVfs: new WorkspaceVfsClientConstructor(options.address, credentials, clientOptions),
  }
}
