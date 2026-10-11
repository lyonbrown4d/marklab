import { describe, expect, it } from 'vitest'
import {
  buildPlateHeadingIndex,
  findPlateActiveHeading,
} from '@/components/plate/plateDocumentHeadingIndex'

const nodes = [
  { type: 'p', children: [{ text: 'Before' }] },
  { type: 'h1', children: [{ text: 'Overview' }] },
  { type: 'p', children: [{ text: 'Body' }] },
  { type: 'h2', children: [{ text: 'Overview' }] },
  { type: 'h3', children: [{ text: 'Details' }] },
]

describe('plateDocumentHeadingIndex', () => {
  it('builds navigation-compatible unique slugs and heading metadata', () => {
    expect(buildPlateHeadingIndex(nodes)).toEqual([
      { blockIndex: 1, level: 1, slug: 'overview', text: 'Overview' },
      { blockIndex: 3, level: 2, slug: 'overview-1', text: 'Overview' },
      { blockIndex: 4, level: 3, slug: 'details', text: 'Details' },
    ])
  })

  it('finds the nearest heading with logarithmic lookup semantics', () => {
    const index = buildPlateHeadingIndex(nodes)

    expect(findPlateActiveHeading(index, 0)).toBeNull()
    expect(findPlateActiveHeading(index, 2)?.slug).toBe('overview')
    expect(findPlateActiveHeading(index, 4)?.slug).toBe('details')
    expect(findPlateActiveHeading(index, 999)?.slug).toBe('details')
  })
})
