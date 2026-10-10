import { describe, expect, it } from 'vitest'
import { buildUnlinkedMentions } from '@/logic/unlinkedMentions'
import type { FsSearchResult } from '@/services/fsApi'

const result = (path: string, line: number, snippet: string, start: number): FsSearchResult => ({
  path,
  title: path,
  line,
  column: start + 1,
  end_column: start + 7,
  snippet,
  snippet_highlights: [{ start, end: start + 6 }],
  score: 1,
})

describe('buildUnlinkedMentions', () => {
  it('keeps probable text mentions separate from current-file and explicit references', () => {
    const results = [
      result('target.md', 2, 'Target owns this line', 0),
      result('linked.md', 4, 'Target is linked elsewhere', 0),
      result('plain.md', 3, 'About Target today', 6),
    ]

    expect(
      buildUnlinkedMentions({
        backlinks: [{ sourcePath: 'linked.md', text: 'Target', context: '', line: 4, column: 1 }],
        results,
        targetPath: 'target.md',
      }),
    ).toEqual([
      {
        sourcePath: 'plain.md',
        text: 'Target',
        context: 'About Target today',
        line: 3,
        column: 7,
        endColumn: 13,
      },
    ])
  })

  it.each([
    ['See [[Target]]', 6],
    ['See [Target](target.md)', 5],
    ['See [label](Target.md)', 12],
    ['See [Target][target]', 5],
  ])('rejects occurrences inside Markdown links: %s', (snippet, start) => {
    expect(
      buildUnlinkedMentions({
        backlinks: [],
        results: [result('source.md', 1, snippet, start)],
        targetPath: 'target.md',
      }),
    ).toEqual([])
  })
})
