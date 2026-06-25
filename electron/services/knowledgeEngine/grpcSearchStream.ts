import type {
  SearchRequest,
  SearchResponse,
} from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'
import type { SearchClient } from '@electron/services/knowledgeEngine/grpcWire.js'
import { createSessionMetadata } from '@electron/services/knowledgeEngine/grpcClientRuntime.js'
import {
  knowledgeSearchOrderToProto,
  searchLimitValue,
  searchResultToFsResult,
  type KnowledgeSearchOptions,
  type KnowledgeSearchResultSet,
} from '@electron/services/knowledgeEngine/knowledgeSearch.js'

export const runSearchWithOptions = (
  sessionToken: string,
  searchClient: SearchClient,
  query: string,
  options: KnowledgeSearchOptions = {},
): Promise<KnowledgeSearchResultSet> => {
  const request: SearchRequest = {
    query,
    limit: searchLimitValue(options.limit),
    includePaths: options.includePaths ?? [],
    offset: Math.max(0, options.offset ?? 0),
    order: knowledgeSearchOrderToProto(options.order),
    includeTotalHits: options.includeTotalHits ?? false,
    includeDiagnostics: options.includeDiagnostics ?? false,
  }

  const stream = searchClient.search(request, createSessionMetadata(sessionToken))
  const resultSet: KnowledgeSearchResultSet = {
    results: [],
    totalHits: 0,
    diagnostics: undefined,
  }

  return new Promise((resolve, reject) => {
    stream.on('data', (response: SearchResponse) => {
      if (response.results?.length) {
        resultSet.results.push(...response.results.map(searchResultToFsResult))
      }
      if (typeof response.totalHits === 'number') {
        resultSet.totalHits = response.totalHits
      }
      if (response.diagnostics) {
        resultSet.diagnostics = {
          elapsedMs: Number(response.diagnostics.elapsedMs),
          returnedHits: response.diagnostics.returnedHits,
          totalHits: response.diagnostics.totalHits,
          offset: response.diagnostics.offset,
          limit: response.diagnostics.limit,
        }
      }
    })
    stream.once('error', reject)
    stream.once('end', () => resolve(resultSet))
  })
}
