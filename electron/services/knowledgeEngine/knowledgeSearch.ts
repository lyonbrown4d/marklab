import type { FsSearchResult } from '@electron/services/workspace/types'

export type KnowledgeSearchOrder = 'score' | 'path' | 'title' | 'pathThenScore'

export type KnowledgeSearchOptions = {
  limit?: number
  includePaths?: string[]
  offset?: number
  order?: KnowledgeSearchOrder
  includeTotalHits?: boolean
  includeDiagnostics?: boolean
}

export type KnowledgeSearchDiagnostics = {
  elapsedMs: number
  returnedHits: number
  totalHits: number
  offset: number
  limit: number
}

export type KnowledgeSearchResultSet = {
  results: FsSearchResult[]
  totalHits: number
  diagnostics?: KnowledgeSearchDiagnostics | null
}

const DEFAULT_SEARCH_LIMIT = 20
const MAX_SEARCH_LIMIT = 100

export const searchLimitValue = (limit?: number): number => {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_SEARCH_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_LIMIT)
}
