import type { FsSearchResult } from '@/services/fsApi'

export type WorkspaceSearchOptions = {
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
}

export type SearchPlanIssue = 'regexTooLong'

export type SearchHighlight = { start: number; end: number }

export type WorkspaceSearchMatch = {
  highlights: SearchHighlight[]
  id: string
  result: FsSearchResult
}

export type WorkspaceSearchGroup = {
  matchCount: number
  matches: WorkspaceSearchMatch[]
  path: string
  title: string
}

export type WorkspaceSearchView = {
  groups: WorkspaceSearchGroup[]
  totalFiles: number
  totalMatches: number
}

const MAX_REGEX_LENGTH = 120
export const validateSearchQuery = (
  rawQuery: string,
  options: WorkspaceSearchOptions,
): SearchPlanIssue | null => {
  const query = rawQuery.trim()
  return options.useRegex && query.length > MAX_REGEX_LENGTH ? 'regexTooLong' : null
}

const resultId = (result: FsSearchResult, index: number): string =>
  `${result.path}:${result.line}:${result.column}:${index}`

export const buildSearchView = (
  occurrences: FsSearchResult[],
  totalMatches = occurrences.length,
): WorkspaceSearchView => {
  const groupsByPath = new Map<string, WorkspaceSearchGroup>()

  occurrences.forEach((result, index) => {
    const match = { highlights: result.snippet_highlights, id: resultId(result, index), result }
    const group = groupsByPath.get(result.path)
    if (group) {
      group.matches.push(match)
      group.matchCount += 1
      return
    }
    groupsByPath.set(result.path, {
      matchCount: 1,
      matches: [match],
      path: result.path,
      title: result.title,
    })
  })

  const groups = [...groupsByPath.values()]
  return {
    groups,
    totalFiles: groups.length,
    totalMatches,
  }
}
