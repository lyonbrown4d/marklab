import type { FsSearchResult } from '@electron/services/workspace/types'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'
import type { KnowledgeSearchOptions } from '@electron/services/knowledgeEngine/knowledgeSearch'

export const normalizeSearchDocument = (
  document: WorkspaceSearchDocument,
): WorkspaceSearchDocument => {
  const normalizedPath = normalizeSearchPath(document.path)
  if (!normalizedPath || normalizedPath === '.') {
    throw new TypeError('Search document path must identify a workspace file.')
  }
  return { ...document, path: normalizedPath }
}

export const searchErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

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
