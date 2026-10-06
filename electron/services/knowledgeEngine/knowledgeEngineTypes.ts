import type {
  FsEntry,
  FsGraph,
  FsPathMetadata,
  FsSnapshot,
} from '@electron/services/workspace/types'

export type KnowledgeDocumentVersion = number | string

export type KnowledgePosition = { line: number; character: number }
export type KnowledgeRange = { start?: KnowledgePosition; end?: KnowledgePosition }
export type KnowledgeTextEdit = { range?: KnowledgeRange; text: string }

export type KnowledgeOpenDocumentInput = {
  documentId: string
  uri: string
  version: KnowledgeDocumentVersion
  content: string
}

export type KnowledgeDocumentChangeInput = {
  documentId: string
  baseVersion: KnowledgeDocumentVersion
  version: KnowledgeDocumentVersion
  changes: KnowledgeTextEdit[]
}

export type KnowledgeResyncDocumentInput = {
  documentId: string
  version: KnowledgeDocumentVersion
  content: string
}

export type KnowledgeCloseDocumentInput = { documentId: string }
export type KnowledgeMarkdownDocumentSymbol = {
  name: string
  kind: number
  level: number
  slug: string
  range?: KnowledgeRange
}
export type KnowledgeMarkdownLink = {
  sourceDocumentId: string
  text: string
  target: string
  range?: KnowledgeRange
  isExternal: boolean
}
export type KnowledgeSyncResponse = {
  acknowledged?: { documentId: string; version: string }
  diagnostics?: { documentId: string; version: string; diagnostics: unknown[] }
  resyncRequired?: { documentId: string; reason: string }
}
export type KnowledgeWorkspaceStatus = {
  health?: {
    ok: boolean
    state: string
    metadataDocuments: string
    searchableDocuments: string
    pendingOutboxEvents: string
    warnings: string[]
  }
  index?: {
    searchIndex: string
    ready: boolean
    metadataDocuments: string
    searchableDocuments: string
    pendingOutboxEvents: string
    building?: boolean
    updatedAt?: string | null
    lastBuildDurationMs?: number | null
    lastBuildError?: string | null
    lastError?: string | null
  }
  storage?: {
    metadataStore: string
    searchIndex: string
    metadataBytes: string
    searchIndexBytes: string
    totalBytes: string
    metadataDocuments: string
    pendingOutboxEvents: string
    blobStore: boolean
    blobBytes: string
  }
}
export type KnowledgeWorkspaceFileEntry = FsEntry
export type KnowledgeWorkspaceFileSnapshot = FsSnapshot
export type KnowledgeWorkspaceGraph = FsGraph
export type KnowledgeWorkspacePathMetadata = FsPathMetadata
export type KnowledgeWorkspacePathMutation = {
  kind: FsEntry['kind']
  changed: boolean
}
