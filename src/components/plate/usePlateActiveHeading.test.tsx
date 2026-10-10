import { act, renderHook } from '@testing-library/react'
import type { PlateEditor } from 'platejs/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getPlateActiveHeadingSlug,
  usePlateActiveHeading,
} from '@/components/plate/usePlateActiveHeading'
import { activeHeadingStore, clearActiveHeading } from '@/utils/editorNavigation'

const createEditor = (blockIndex: number) => {
  const children = [
    { type: 'p', children: [{ text: 'Before' }] },
    { type: 'h1', children: [{ text: 'Overview' }] },
    { type: 'p', children: [{ text: 'Body' }] },
    { type: 'h2', children: [{ text: 'Overview' }] },
    { type: 'p', children: [{ text: 'More' }] },
  ]
  return {
    api: {
      string: ([index]: number[]) => String(children[index].children[0].text),
    },
    children,
    selection: {
      anchor: { offset: 0, path: [blockIndex, 0] },
      focus: { offset: 0, path: [blockIndex, 0] },
    },
  } as unknown as PlateEditor
}

afterEach(() => clearActiveHeading('guide.md'))

describe('usePlateActiveHeading', () => {
  it('resolves the nearest preceding heading with navigation-compatible duplicate slugs', () => {
    expect(getPlateActiveHeadingSlug(createEditor(0))).toBeNull()
    expect(getPlateActiveHeadingSlug(createEditor(2))).toBe('overview')
    expect(getPlateActiveHeadingSlug(createEditor(4))).toBe('overview-1')
  })

  it('uses the focus edge as the active caret for a reversed selection', () => {
    const editor = createEditor(4)
    editor.selection = {
      anchor: { offset: 0, path: [4, 0] },
      focus: { offset: 0, path: [2, 0] },
    }

    expect(getPlateActiveHeadingSlug(editor)).toBe('overview')
  })

  it('publishes selection changes and clears the path on unmount', () => {
    const editor = createEditor(2)
    const { result, unmount } = renderHook(() => usePlateActiveHeading('guide.md', editor, true))
    expect(activeHeadingStore.getState().headings['guide.md']).toBe('overview')

    editor.selection = { anchor: { offset: 0, path: [4, 0] }, focus: { offset: 0, path: [4, 0] } }
    act(() => result.current())
    expect(activeHeadingStore.getState().headings['guide.md']).toBe('overview-1')

    unmount()
    expect(activeHeadingStore.getState().headings['guide.md']).toBeUndefined()
  })
})
