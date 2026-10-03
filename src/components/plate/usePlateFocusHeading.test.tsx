import { act, renderHook } from '@testing-library/react'
import type { PlateEditor } from 'platejs/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlateFocusHeading } from '@/components/plate/usePlateFocusHeading'
import { requestFocusHeading } from '@/utils/editorNavigation'

const focusPlateHeading = vi.fn<(editor: PlateEditor, slug: string) => boolean>()

vi.mock('@/components/plate/plateHeadingNavigation', () => ({
  focusPlateHeading: (...args: [PlateEditor, string]) => focusPlateHeading(...args),
}))

afterEach(() => {
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
})
