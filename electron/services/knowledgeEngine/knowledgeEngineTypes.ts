import type { ClientOptions } from '@grpc/grpc-js'
import type {
  ApplyDocumentChange,
  CloseDocument,
  GetWorkspaceStatusResponse,
  MarkdownDocumentSymbol,
  MarkdownLink,
  OpenDocument,
  ResyncDocument,
  SyncResponse,
  TextEdit,
} from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'
import type { FsEntry, FsPathMetadata, FsSnapshot } from '@electron/services/workspace/types.js'
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
export type KnowledgeWorkspaceStatus = GetWorkspaceStatusResponse
export type KnowledgeWorkspaceFileEntry = FsEntry
export type KnowledgeWorkspaceFileSnapshot = FsSnapshot
export type KnowledgeWorkspacePathMetadata = FsPathMetadata
export type KnowledgeWorkspacePathMutation = {
  kind: FsEntry['kind']
  changed: boolean
}

export type KnowledgeEngineGrpcClientOptions = {
  address: string
  sessionToken: string
  clientOptions?: Partial<ClientOptions>
  clients?: KnowledgeEngineGrpcClients
}
