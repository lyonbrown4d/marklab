import type { ClientOptions } from '@grpc/grpc-js'
import type {
  ApplyDocumentChange,
  CloseDocument,
  MarkdownDocumentSymbol,
  MarkdownLink,
  OpenDocument,
  ResyncDocument,
  SyncResponse,
  TextEdit,
} from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'
import type { KnowledgeEngineGrpcClients } from '@electron/services/knowledgeEngine/grpcWire.js'

export type KnowledgeDocumentVersion = number | string

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

export type KnowledgeEngineGrpcClientOptions = {
  address: string
  sessionToken: string
  clientOptions?: Partial<ClientOptions>
  clients?: KnowledgeEngineGrpcClients
}
