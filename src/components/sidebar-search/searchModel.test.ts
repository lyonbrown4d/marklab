import { describe, expect, it } from 'vitest'
import type { FsSearchResult } from '@/services/fsApi'
import {
  buildSearchView,
  validateSearchQuery,
  type WorkspaceSearchOptions,
} from '@/components/sidebar-search/searchModel'

const defaultOptions: WorkspaceSearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
}

const result = (
  path: string,
  line: number,
  snippet: string,
  title = path.split('/').at(-1) ?? path,
): FsSearchResult => ({
  column: 1,
  end_column: 2,
  line,
  path,
  score: 1,
  snippet,
  snippet_highlights: [],
  title,
})

describe('validateSearchQuery', () => {
  it('does not impose the regular-expression safety limit on ordinary searches', () => {
    const longQuery = 'a'.repeat(140)
    expect(validateSearchQuery(longQuery, defaultOptions)).toBeNull()
  })

  it('reports a specific validation issue for an overlong regular expression', () => {
    expect(validateSearchQuery('a'.repeat(121), { ...defaultOptions, useRegex: true })).toBe(
      'regexTooLong',
    )
  })
})

describe('buildSearchView', () => {
  const candidates = [
    result('docs/Architecture.md', 4, 'Architecture overview'),
    result('docs/Architecture.md', 18, 'software architecture details'),
    result('notes/ideas.md', 7, 'architectures evolve'),
  ]

  it('groups backend results by file and reports result and file totals', () => {
    const view = buildSearchView(candidates, 11)

    expect(view.groups).toHaveLength(2)
    expect(view.groups[0]).toMatchObject({ path: 'docs/Architecture.md', matchCount: 2 })
    expect(view.totalMatches).toBe(11)
    expect(view.totalFiles).toBe(2)
  })

  it('uses backend occurrence highlights without renderer filtering or recomputation', () => {
    const highlighted = result('notes.md', 3, 'backend-selected text')
    highlighted.snippet_highlights = [{ start: 8, end: 16 }]

    const view = buildSearchView([highlighted])

    expect(view.totalMatches).toBe(1)
    expect(view.groups[0]?.matches[0]?.highlights).toEqual([{ start: 8, end: 16 }])
  })
})
