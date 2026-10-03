import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { findPlateHeadingPath, focusPlateHeading } from '@/components/plate/plateHeadingNavigation'

const createEditor = () =>
  createPlateEditor({
    value: [
      { type: 'h1', children: [{ text: 'Overview' }] },
      { type: 'p', children: [{ text: 'Body' }] },
      { type: 'h2', children: [{ text: 'Overview' }] },
      { type: 'h3', children: [{ text: 'API & Usage' }] },
    ],
  })

describe('Plate heading navigation', () => {
  it('matches generated heading slugs including duplicates', () => {
    const editor = createEditor()

    expect(findPlateHeadingPath(editor, 'overview')).toEqual([0])
    expect(findPlateHeadingPath(editor, 'overview-1')).toEqual([2])
    expect(findPlateHeadingPath(editor, 'api-usage')).toEqual([3])
    expect(findPlateHeadingPath(editor, 'missing')).toBeNull()
  })

  it('selects and focuses the matching heading', () => {
    const editor = createEditor()

    expect(focusPlateHeading(editor, 'overview-1', { scroll: false })).toBe(true)
    expect(editor.selection).toEqual({
      anchor: { offset: 0, path: [2, 0] },
      focus: { offset: 0, path: [2, 0] },
    })
  })
})
