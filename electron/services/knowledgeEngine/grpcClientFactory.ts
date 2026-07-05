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

export const KNOWLEDGE_ENGINE_GRPC_MESSAGE_LIMIT_BYTES = 32 * 1024 * 1024

export const createKnowledgeEngineGrpcClients = (
  options: KnowledgeEngineGrpcClientOptions,
): KnowledgeEngineGrpcClients => {
  if (options.clients) return options.clients

  const credentials = ChannelCredentials.createInsecure()
  const clientOptions = {
    'grpc.enable_http_proxy': 0,
    'grpc.max_receive_message_length': KNOWLEDGE_ENGINE_GRPC_MESSAGE_LIMIT_BYTES,
    'grpc.max_send_message_length': KNOWLEDGE_ENGINE_GRPC_MESSAGE_LIMIT_BYTES,
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
