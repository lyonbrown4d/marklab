import type {
  KnowledgeCloseDocumentInput,
  KnowledgeDocumentChangeInput,
  KnowledgeDocumentVersion,
  KnowledgeOpenDocumentInput,
  KnowledgeResyncDocumentInput,
  KnowledgeSyncResponse,
} from '@electron/services/knowledgeEngine/knowledgeEngineTypes.js'
import type { DocumentSessionClient } from '@electron/services/knowledgeEngine/grpcWire.js'
import { syncOnce } from '@electron/services/knowledgeEngine/grpcClientRuntime.js'

export const openMarkdownDocumentSync = (
  sessionToken: string,
  documentSession: DocumentSessionClient,
  workspaceInstanceId: string,
  document: KnowledgeOpenDocumentInput,
): Promise<KnowledgeSyncResponse> =>
  syncOnce(sessionToken, documentSession, {
    open: { ...document, version: versionToProto(document.version) },
    workspaceInstanceId,
  })

export const changeMarkdownDocumentSync = (
  sessionToken: string,
  documentSession: DocumentSessionClient,
  workspaceInstanceId: string,
  change: KnowledgeDocumentChangeInput,
): Promise<KnowledgeSyncResponse> =>
  syncOnce(sessionToken, documentSession, {
    change: {
      ...change,
      baseVersion: versionToProto(change.baseVersion),
      version: versionToProto(change.version),
    },
    workspaceInstanceId,
  })

export const closeMarkdownDocumentSync = (
  sessionToken: string,
  documentSession: DocumentSessionClient,
  workspaceInstanceId: string,
  document: KnowledgeCloseDocumentInput,
): Promise<KnowledgeSyncResponse> =>
  syncOnce(sessionToken, documentSession, { close: document, workspaceInstanceId })

export const resyncMarkdownDocumentSync = (
  sessionToken: string,
  documentSession: DocumentSessionClient,
  workspaceInstanceId: string,
  document: KnowledgeResyncDocumentInput,
): Promise<KnowledgeSyncResponse> =>
  syncOnce(sessionToken, documentSession, {
    resync: { ...document, version: versionToProto(document.version) },
    workspaceInstanceId,
  })

const versionToProto = (version: KnowledgeDocumentVersion): string => String(version)
