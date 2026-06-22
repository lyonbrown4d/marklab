import { describe, expect, it } from 'vitest'

import type { AllPagesRow } from '@/logic/allPages'
import {
  builtInMarkdownCollections,
  filterRowsByMarkdownCollection,
  matchesMarkdownCollection,
  summarizeMarkdownCollections,
} from '@/logic/markdownCollections'

const rows: AllPagesRow[] = [
  {
    assets: 0,
    folder: 'notes',
    headings: 4,
    indexed: true,
    issues: 0,
    links: 2,
    path: 'notes/structured.md',
    title: 'Structured',
  },
  {
    assets: 1,
    folder: 'notes',
    headings: 1,
    indexed: true,
    issues: 2,
    links: 0,
    path: 'notes/issues.md',
    title: 'Issues',
  },
]

describe('markdownCollections', () => {
  it('matches rows with composable markdown collection rules', () => {
    expect(
      matchesMarkdownCollection(rows[0], {
        descriptionKey: 'test',
        id: 'structured-linked',
        labelKey: 'test',
        rules: [
          { kind: 'minHeadings', value: 3 },
          { kind: 'minLinks', value: 1 },
        ],
      }),
    ).toBe(true)
  })

  it('filters rows by built-in collection definitions', () => {
    const needsAttention = builtInMarkdownCollections.find(
      (collection) => collection.id === 'needs-attention',
    )
    expect(needsAttention).toBeDefined()
    expect(filterRowsByMarkdownCollection(rows, needsAttention!).map((row) => row.path)).toEqual([
      'notes/issues.md',
    ])
  })

  it('summarizes collection counts without mutating row order', () => {
    expect(summarizeMarkdownCollections(rows, builtInMarkdownCollections)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ count: 2, id: 'all' }),
        expect.objectContaining({ count: 1, id: 'needs-attention' }),
        expect.objectContaining({ count: 1, id: 'linked' }),
        expect.objectContaining({ count: 1, id: 'structured' }),
      ]),
    )
    expect(rows.map((row) => row.path)).toEqual(['notes/structured.md', 'notes/issues.md'])
  })
})
