import { describe, expect, it, vi } from 'vitest'

import {
  createKnowledgeEngineGrpcClients,
  KNOWLEDGE_ENGINE_GRPC_MESSAGE_LIMIT_BYTES,
} from '@electron/services/knowledgeEngine/grpcClientFactory.js'
import {
  ControlClientConstructor,
  DocumentSessionClientConstructor,
  MarkdownClientConstructor,
  SearchClientConstructor,
  WorkspaceClientConstructor,
  WorkspaceVfsClientConstructor,
} from '@electron/services/knowledgeEngine/grpcWire.js'

vi.mock('@electron/services/knowledgeEngine/grpcWire.js', () => {
  const makeClientConstructor = () =>
    vi.fn(function MockClient() {
      return { close: vi.fn() }
    })

  return {
    ControlClientConstructor: makeClientConstructor(),
    DocumentSessionClientConstructor: makeClientConstructor(),
    MarkdownClientConstructor: makeClientConstructor(),
    SearchClientConstructor: makeClientConstructor(),
    WorkspaceClientConstructor: makeClientConstructor(),
    WorkspaceVfsClientConstructor: makeClientConstructor(),
  }
})

const clientConstructors = [
  ControlClientConstructor,
  DocumentSessionClientConstructor,
  MarkdownClientConstructor,
  SearchClientConstructor,
  WorkspaceClientConstructor,
  WorkspaceVfsClientConstructor,
]

describe('createKnowledgeEngineGrpcClients', () => {
  it('raises grpc message limits for large workspace graph responses', () => {
    createKnowledgeEngineGrpcClients({
      address: '127.0.0.1:40101',
      sessionToken: 'session-token-a',
    })

    for (const ClientConstructor of clientConstructors) {
      expect(ClientConstructor).toHaveBeenCalledWith(
        '127.0.0.1:40101',
        expect.anything(),
        expect.objectContaining({
          'grpc.enable_http_proxy': 0,
          'grpc.max_receive_message_length': KNOWLEDGE_ENGINE_GRPC_MESSAGE_LIMIT_BYTES,
          'grpc.max_send_message_length': KNOWLEDGE_ENGINE_GRPC_MESSAGE_LIMIT_BYTES,
        }),
      )
    }
  })

  it('allows explicit client options to override defaults', () => {
    createKnowledgeEngineGrpcClients({
      address: '127.0.0.1:40101',
      clientOptions: {
        'grpc.max_receive_message_length': 8 * 1024 * 1024,
      },
      sessionToken: 'session-token-a',
    })

    expect(WorkspaceClientConstructor).toHaveBeenLastCalledWith(
      '127.0.0.1:40101',
      expect.anything(),
      expect.objectContaining({
        'grpc.max_receive_message_length': 8 * 1024 * 1024,
        'grpc.max_send_message_length': KNOWLEDGE_ENGINE_GRPC_MESSAGE_LIMIT_BYTES,
      }),
    )
  })
})
