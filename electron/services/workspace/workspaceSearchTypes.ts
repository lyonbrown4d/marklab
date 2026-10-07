export type WorkspaceSearchDocument = {
  path: string
  title: string
  content: string
}

export type WorkspaceSearchMutationBatch = {
  removeDocuments: string[]
  removePrefixes: string[]
  upserts: WorkspaceSearchDocument[]
}

export type WorkspaceOccurrenceSearchOptions = {
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
}

export type WorkspaceOccurrenceSearchRequest = {
  requestId: string
  query: string
  limit?: number
  options: WorkspaceOccurrenceSearchOptions
}

export type WorkspaceOccurrenceSearchResultSet = {
  requestId: string
  results: import('@electron/services/workspace/types').FsSearchResult[]
  totalHits: number
  scannedDocuments: number
  truncated: boolean
}

export type WorkspaceOccurrenceSearchCancelResult = {
  requestId: string
  cancelled: boolean
}
