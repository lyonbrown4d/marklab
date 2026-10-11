import { act, renderHook } from '@testing-library/react'
import type { PlateEditor } from 'platejs/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getPlateActiveHeading,
  getPlateActiveHeadingSlug,
  invalidateChangedPlateHeadingIndex,
  invalidatePlateHeadingIndex,
  usePlateActiveHeading,
} from '@/components/plate/usePlateActiveHeading'
import { activeHeadingStore, clearActiveHeading } from '@/utils/editorNavigation'

type TestPlateOperation = {
  newPath?: number[]
  newProperties?: Record<string, unknown>
  path?: number[]
  properties?: Record<string, unknown>
  type: string
}

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
    operations: [] as TestPlateOperation[],
    selection: {
      anchor: { offset: 0, path: [blockIndex, 0] },
      focus: { offset: 0, path: [blockIndex, 0] },
    },
  } as unknown as PlateEditor
}

const setEditorOperations = (editor: PlateEditor, operations: TestPlateOperation[]) => {
  ;(editor as unknown as { operations: TestPlateOperation[] }).operations = operations
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

  it('reuses the heading index for selection movement and rebuilds only after invalidation', () => {
    const editor = createEditor(2)
    const first = getPlateActiveHeading(editor)
    editor.selection = { anchor: { offset: 0, path: [4, 0] }, focus: { offset: 0, path: [4, 0] } }
    const second = getPlateActiveHeading(editor)

    expect(first?.slug).toBe('overview')
    expect(second?.slug).toBe('overview-1')
    expect(second?.text).toBe('Overview')

    ;(editor.children[3] as { children: Array<{ text: string }> }).children[0]!.text = 'Changed'
    expect(getPlateActiveHeading(editor)?.slug).toBe('overview-1')
    invalidatePlateHeadingIndex(editor)
    expect(getPlateActiveHeading(editor)?.slug).toBe('changed')
  })

  it('keeps the cached heading index for ordinary paragraph typing', () => {
    const editor = createEditor(2)
    expect(getPlateActiveHeadingSlug(editor)).toBe('overview')
    setEditorOperations(
      editor,
      Array.from({ length: 10_000 }, () => ({ path: [2, 0], type: 'insert_text' })),
    )

    expect(invalidateChangedPlateHeadingIndex(editor)).toBe(false)

    ;(editor.children[1] as { children: Array<{ text: string }> }).children[0]!.text = 'Changed'
    expect(getPlateActiveHeadingSlug(editor)).toBe('overview')
  })

  it('invalidates an empty operation batch for a full external value replacement', () => {
    const editor = createEditor(2)
    expect(getPlateActiveHeadingSlug(editor)).toBe('overview')
    ;(editor.children[1] as { children: Array<{ text: string }> }).children[0]!.text = 'Changed'

    expect(invalidateChangedPlateHeadingIndex(editor, true)).toBe(true)
    expect(getPlateActiveHeadingSlug(editor)).toBe('changed')
  })

  it.each([
    [{ path: [1, 0], type: 'insert_text' }],
    [{ path: [1], type: 'insert_node' }],
    [{ path: [3], type: 'remove_node' }],
    [{ newProperties: { type: 'h2' }, path: [2], properties: { type: 'p' }, type: 'set_node' }],
  ])('invalidates the heading index for heading or top-level structure operations', (operation) => {
    const editor = createEditor(2)
    expect(getPlateActiveHeadingSlug(editor)).toBe('overview')
    ;(editor.children[1] as { children: Array<{ text: string }> }).children[0]!.text = 'Changed'
    setEditorOperations(editor, [operation])

    expect(invalidateChangedPlateHeadingIndex(editor)).toBe(true)
    expect(getPlateActiveHeadingSlug(editor)).toBe('changed')
  })

  it('publishes selection changes and clears the path on unmount', () => {
    const editor = createEditor(2)
    const { result, unmount } = renderHook(() => usePlateActiveHeading('guide.md', editor, true))
    expect(activeHeadingStore.getState().headings['guide.md']).toBe('overview')
    expect(activeHeadingStore.getState().headingDetails['guide.md']).toMatchObject({
      level: 1,
      text: 'Overview',
    })

    ;(editor.children[1] as { children: Array<{ text: string }> }).children[0]!.text = 'OVERVIEW'
    invalidatePlateHeadingIndex(editor)
    act(() => result.current())
    expect(activeHeadingStore.getState().headingDetails['guide.md']?.text).toBe('OVERVIEW')

    editor.selection = { anchor: { offset: 0, path: [4, 0] }, focus: { offset: 0, path: [4, 0] } }
    act(() => result.current())
    expect(activeHeadingStore.getState().headings['guide.md']).toBe('overview-1')

    unmount()
    expect(activeHeadingStore.getState().headings['guide.md']).toBeUndefined()
  })
})
