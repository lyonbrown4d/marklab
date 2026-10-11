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
      result('linked.md', 4, 'See [[Target]]', 6),
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
    ['See [About Target today](target.md)', 11],
    ['See [label](notes/Target.md)', 18],
    ['See [label](notes/(Target).md)', 19],
    ['See [label][Target]', 12],
    ['See [[note|Target label]]', 11],
  ])('rejects occurrences inside Markdown links: %s', (snippet, start) => {
    expect(
      buildUnlinkedMentions({
        backlinks: [],
        results: [result('source.md', 1, snippet, start)],
        targetPath: 'target.md',
      }),
    ).toEqual([])
  })

  it.each([
    '[[Target]] and Target needs review',
    '[About Target today](target.md) and Target needs review',
    '[label](Target.md) and Target needs review',
    '[Target][Target] and Target needs review',
    'Target needs review and [[Target]]',
  ])('keeps the plain occurrence alongside explicit links: %s', (snippet) => {
    const plainStart = snippet.indexOf('Target needs review')
    const results = Array.from(snippet.matchAll(/Target/gu), (match) =>
      result('source.md', 4, snippet, match.index),
    )
    expect(
      buildUnlinkedMentions({
        backlinks: [
          { sourcePath: 'source.md', text: 'Target', context: snippet, line: 4, column: 1 },
        ],
        results,
        targetPath: 'target.md',
      }),
    ).toEqual([
      {
        sourcePath: 'source.md',
        text: 'Target',
        context: snippet,
        line: 4,
        column: plainStart + 1,
        endColumn: plainStart + 7,
      },
    ])
  })

  it('ignores results without a highlight', () => {
    expect(
      buildUnlinkedMentions({
        backlinks: [],
        results: [{ ...result('source.md', 1, 'Target', 0), snippet_highlights: [] }],
        targetPath: 'target.md',
      }),
    ).toEqual([])
  })

  it('uses backlink line context when a search snippet truncates link syntax', () => {
    const context = `${'x'.repeat(129)}[Target](target.md)`
    expect(
      buildUnlinkedMentions({
        backlinks: [{ sourcePath: 'source.md', text: 'Target', context, line: 1, column: 130 }],
        results: [
          {
            ...result('source.md', 1, 'Target', 0),
            column: 131,
            end_column: 137,
          },
        ],
        targetPath: 'target.md',
      }),
    ).toEqual([])
  })
})
