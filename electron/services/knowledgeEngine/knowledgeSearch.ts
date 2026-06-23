import {
  SearchOrder,
  type SearchResult,
} from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'
import type { FsSearchResult } from '@electron/services/workspace/types.js'

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

export const knowledgeSearchOrderToProto = (order?: KnowledgeSearchOrder): SearchOrder =>
  order === 'path'
    ? SearchOrder.SEARCH_ORDER_PATH
    : order === 'title'
      ? SearchOrder.SEARCH_ORDER_TITLE
      : order === 'pathThenScore'
        ? SearchOrder.SEARCH_ORDER_PATH_THEN_SCORE
        : SearchOrder.SEARCH_ORDER_SCORE

export const searchLimitValue = (limit?: number): number => {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_SEARCH_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_LIMIT)
}

export const searchResultToFsResult = (result: SearchResult): FsSearchResult => ({
  column: Math.max(result.column, 1),
  end_column: Math.max(result.endColumn, 1),
  line: result.line,
  path: result.path,
  score: result.score,
  snippet: result.snippet,
  snippet_highlights: result.snippetHighlights.map((highlight) => ({
    end: highlight.end,
    start: highlight.start,
  })),
  title: result.title || result.path,
})
