import MiniSearch, { type SearchResult } from 'minisearch'

import type { FsSearchResult } from '@electron/services/workspace/types.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'
import type { KnowledgeSearchOptions } from '@electron/services/knowledgeEngine/knowledgeSearch.js'
import { createMiniSearch } from '@electron/services/knowledgeEngine/nodeSearchConfig.js'

export type IndexedCandidate = {
  matches: string[]
  score: number
}

export const indexedSearchCandidates = (
  miniSearch: MiniSearch<WorkspaceSearchDocument>,
  query: string,
  searchOptions: Parameters<MiniSearch<WorkspaceSearchDocument>['search']>[1],
): Map<string, IndexedCandidate> => {
  const candidates = new Map<string, IndexedCandidate>()
  for (const result of miniSearch.search(query, searchOptions)) {
    const documentPath = searchResultPath(result)
    if (!documentPath) continue
    candidates.set(documentPath, {
      matches: Object.keys(result.match),
      score: result.score,
    })
  }
  return candidates
}

export const applyIncrementalIndexChanges = (
  miniSearch: MiniSearch<WorkspaceSearchDocument>,
  previous: Map<string, WorkspaceSearchDocument>,
  current: Map<string, WorkspaceSearchDocument>,
): void => {
  for (const [documentPath, document] of previous) {
    const next = current.get(documentPath)
    if (!next) {
      miniSearch.discard(documentPath)
    } else if (!sameSearchDocument(document, next)) {
      miniSearch.replace(next)
    }
  }
  for (const [documentPath, document] of current) {
    if (!previous.has(documentPath)) miniSearch.add(document)
  }
}

export const rebuildMiniSearch = (
  documents: Iterable<WorkspaceSearchDocument>,
): MiniSearch<WorkspaceSearchDocument> => {
  const next = createMiniSearch()
  next.addAll([...documents])
  return next
}

export const normalizeSearchDocument = (
  document: WorkspaceSearchDocument,
): WorkspaceSearchDocument => {
  const normalizedPath = normalizeSearchPath(document.path)
  if (!normalizedPath || normalizedPath === '.') {
    throw new TypeError('Search document path must identify a workspace file.')
  }
  return { ...document, path: normalizedPath }
}

export const storeSearchDocument = (
  documents: Map<string, WorkspaceSearchDocument>,
  document: WorkspaceSearchDocument,
): void => {
  const normalized = normalizeSearchDocument(document)
  documents.set(normalized.path, normalized)
}

export const removeSearchPathPrefix = (
  documents: Map<string, WorkspaceSearchDocument>,
  prefix: string,
): void => {
  const normalizedPrefix = normalizeSearchPath(prefix)
  for (const documentPath of documents.keys()) {
    if (pathMatchesInclude(documentPath, normalizedPrefix)) documents.delete(documentPath)
  }
}

export const sameSearchDocument = (
  left: WorkspaceSearchDocument,
  right: WorkspaceSearchDocument,
): boolean => left.title === right.title && left.content === right.content

export const serializedIndexBytes = (serializedIndex: unknown): number =>
  Buffer.byteLength(JSON.stringify(serializedIndex))

export const searchErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const searchResultPath = (result: SearchResult): string | null => {
  const pathValue = typeof result.path === 'string' ? result.path : result.id
  return typeof pathValue === 'string' ? normalizeSearchPath(pathValue) : null
}

export const normalizeSearchPath = (value: string): string => {
  let normalized = value
    .trim()
    .replaceAll('\\', '/')
    .replace(/\/{2,}/g, '/')
  while (normalized.startsWith('./')) normalized = normalized.slice(2)
  while (normalized.endsWith('/')) normalized = normalized.slice(0, -1)
  return normalized
}

export const includeDocumentPath = (documentPath: string, includes: string[]): boolean =>
  includes.length === 0 || includes.some((include) => pathMatchesInclude(documentPath, include))

export const pathMatchesInclude = (documentPath: string, include: string): boolean =>
  !include || include === '.' || documentPath === include || documentPath.startsWith(`${include}/`)

export const normalizeSearchOffset = (offset?: number): number =>
  typeof offset === 'number' && Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0

export const sortSearchResults = (
  results: FsSearchResult[],
  order: KnowledgeSearchOptions['order'],
): void => {
  results.sort((left, right) => {
    if (order === 'path') {
      return (
        compareText(left.path, right.path) ||
        right.score - left.score ||
        compareText(left.title, right.title)
      )
    }
    if (order === 'title') {
      return (
        compareText(left.title, right.title) ||
        right.score - left.score ||
        compareText(left.path, right.path)
      )
    }
    if (order === 'pathThenScore') {
      return compareText(left.path, right.path) || right.score - left.score
    }
    return right.score - left.score || compareText(left.path, right.path)
  })
}

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0
