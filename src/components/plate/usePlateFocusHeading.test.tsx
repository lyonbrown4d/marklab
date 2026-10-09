import { act, renderHook } from '@testing-library/react'
import type { PlateEditor } from 'platejs/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlateFocusHeading } from '@/components/plate/usePlateFocusHeading'
import {
  clearPendingHeadingNavigation,
  headingNavigationStore,
  requestFocusHeading,
} from '@/utils/editorNavigation'

const focusPlateHeading = vi.fn<(editor: PlateEditor, slug: string) => boolean>()

vi.mock('@/components/plate/plateHeadingNavigation', () => ({
  focusPlateHeading: (...args: [PlateEditor, string]) => focusPlateHeading(...args),
}))

afterEach(() => {
  clearPendingHeadingNavigation()
  focusPlateHeading.mockReset()
  vi.useRealTimers()
})

describe('usePlateFocusHeading', () => {
  it('retries a heading request while a large document is still loading', () => {
    vi.useFakeTimers()
    const editor = {} as PlateEditor
    let currentEditor: PlateEditor | null = null
    focusPlateHeading.mockReturnValue(false)
    renderHook(() => usePlateFocusHeading('notes/large.md', () => currentEditor))

    act(() => requestFocusHeading({ path: 'notes/large.md', slug: 'target' }))
    expect(focusPlateHeading).not.toHaveBeenCalled()

    currentEditor = editor
    focusPlateHeading.mockReturnValue(true)
    act(() => vi.advanceTimersByTime(100))

    expect(focusPlateHeading).toHaveBeenCalledWith(editor, 'target')
  })

  it('ignores requests for another document', () => {
    const editor = {} as PlateEditor
    renderHook(() => usePlateFocusHeading('notes/current.md', () => editor))

    act(() => requestFocusHeading({ path: 'notes/other.md', slug: 'target' }))

    expect(focusPlateHeading).not.toHaveBeenCalled()
  })

  it('consumes a matching sticky request that was queued before the editor mounted', () => {
    const editor = {} as PlateEditor
    focusPlateHeading.mockReturnValue(true)
    act(() =>
      requestFocusHeading({
        path: 'notes/target.md',
        slug: 'details',
        workspaceKey: 'external:C:/notes',
      }),
    )

    renderHook(() => usePlateFocusHeading('notes/target.md', () => editor, 'external:C:/notes'))

    expect(focusPlateHeading).toHaveBeenCalledWith(editor, 'details')
    expect(
      headingNavigationStore.getState().requests['external:C:/notes:notes/target.md'],
    ).toBeUndefined()
  })

  it('does not consume a sticky request from another workspace', () => {
    const editor = {} as PlateEditor
    focusPlateHeading.mockReturnValue(true)
    act(() =>
      requestFocusHeading({
        path: 'notes/target.md',
        slug: 'details',
        workspaceKey: 'external:D:/other',
      }),
    )

    renderHook(() => usePlateFocusHeading('notes/target.md', () => editor, 'external:C:/notes'))

    expect(focusPlateHeading).not.toHaveBeenCalled()
  })
})
