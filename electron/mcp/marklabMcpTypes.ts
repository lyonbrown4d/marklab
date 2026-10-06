export type MarklabMcpWorkspaceStatus = {
  workspaceRoot: string
  engineDataDir: string
  health: {
    ok: boolean
    state: string
    metadataDocuments: string
    searchableDocuments: string
    pendingOutboxEvents: string
    warnings: string[]
  }
  index: {
    searchIndex: string
    ready: boolean
    metadataDocuments: string
    searchableDocuments: string
    pendingOutboxEvents: string
  }
  storage: {
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

export type MarklabMcpSearchResult = {
  documentId: string
  path: string
  title: string
  line: number
  column: number
  endColumn: number
  snippet: string
  snippetHighlights: Array<{ start: number; end: number }>
  score: number
}

export type MarklabMcpSearchResultSet = {
  query: string
  limit: number
  totalHits: number
  resultCount: number
  results: MarklabMcpSearchResult[]
}

export type MarklabMcpWorkspaceAdapter = {
  close?: () => Promise<void>
  getWorkspaceStatus: () => Promise<MarklabMcpWorkspaceStatus>
  searchWorkspace: (query: string, limit: number) => Promise<MarklabMcpSearchResultSet>
}
