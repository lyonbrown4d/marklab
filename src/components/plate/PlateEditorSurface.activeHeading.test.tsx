import { act, render, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'
import { activeHeadingStore, clearActiveHeading } from '@/utils/editorNavigation'

const activePath = 'notes/guide.md'

afterEach(() => clearActiveHeading(activePath))

describe('PlateEditorSurface active heading synchronization', () => {
  it('updates the active slug when a preceding heading changes without moving the caret', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath={activePath}
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value={'# Overview\n\nBody'}
      />,
    )
    const editor = ref.current?.getEditor()
    expect(editor).toBeDefined()

    act(() => editor?.tf.select({ offset: 2, path: [1, 0] }))
    await waitFor(() => {
      expect(activeHeadingStore.getState().headings[activePath]).toBe('overview')
    })

    act(() => {
      editor?.tf.delete({
        at: {
          anchor: { offset: 0, path: [0, 0] },
          focus: { offset: 'Overview'.length, path: [0, 0] },
        },
      })
      editor?.tf.insertText('Renamed', { at: { offset: 0, path: [0, 0] } })
    })
    expect(editor?.api.string([0])).toBe('Renamed')

    await waitFor(() => {
      expect(activeHeadingStore.getState().headings[activePath]).toBe('renamed')
    })
  })
})
