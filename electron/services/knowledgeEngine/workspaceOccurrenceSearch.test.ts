import { describe, expect, it } from 'vitest'

import { searchWorkspaceOccurrences } from '@electron/services/knowledgeEngine/workspaceOccurrenceSearch'

const document = {
  content: 'summary without the term\nsecond needle here\nneedle and NEEDLE\na catalog and a cat',
  path: 'notes/example.md',
  title: 'Example',
}

describe('searchWorkspaceOccurrences', () => {
  it('finds every occurrence in complete document content', () => {
    const result = searchWorkspaceOccurrences([document], {
      caseSensitive: false,
      limit: 20,
      query: 'needle',
      useRegex: false,
      wholeWord: false,
    })

    expect(result.results).toMatchObject([
      { path: 'notes/example.md', line: 2, column: 8, end_column: 14 },
      { path: 'notes/example.md', line: 3, column: 1, end_column: 7 },
      { path: 'notes/example.md', line: 3, column: 12, end_column: 18 },
    ])
    expect(result.totalHits).toBe(3)
  })

  it('honors case-sensitive and Unicode-aware whole-word options', () => {
    const caseSensitive = searchWorkspaceOccurrences([document], {
      caseSensitive: true,
      limit: 20,
      query: 'needle',
      useRegex: false,
      wholeWord: false,
    })
    const wholeWord = searchWorkspaceOccurrences([document], {
      caseSensitive: false,
      limit: 20,
      query: 'cat',
      useRegex: false,
      wholeWord: true,
    })

    expect(caseSensitive.results).toHaveLength(2)
    expect(wholeWord.results).toMatchObject([{ line: 4, column: 17, end_column: 20 }])
  })

  it('returns exact regex coordinates and snippet highlight offsets', () => {
    const result = searchWorkspaceOccurrences([document], {
      caseSensitive: false,
      limit: 20,
      query: 'n(e+)dle',
      useRegex: true,
      wholeWord: false,
    })

    expect(result.results[0]).toEqual({
      column: 8,
      end_column: 14,
      line: 2,
      path: 'notes/example.md',
      score: 1,
      snippet: 'second needle here',
      snippet_highlights: [{ end: 13, start: 7 }],
      title: 'Example',
    })
  })

  it('counts all hits while bounding returned payloads', () => {
    const result = searchWorkspaceOccurrences([document], {
      caseSensitive: false,
      limit: 1,
      query: 'needle',
      useRegex: false,
      wholeWord: false,
    })

    expect(result.results).toHaveLength(1)
    expect(result.totalHits).toBe(3)
  })
})
