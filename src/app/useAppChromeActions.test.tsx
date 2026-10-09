import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAppChromeActions } from '@/app/useAppChromeActions'

describe('useAppChromeActions', () => {
  it('opens chrome surfaces and toggles editor preferences', () => {
    const openCommandPalette = vi.fn()
    const openSettings = vi.fn()
    const setEditorReadOnlyMode = vi.fn()
    const setShowEditorStatusBar = vi.fn()
    const setViewMode = vi.fn()
    const { result } = renderHook(() =>
      useAppChromeActions({
        titlebarRef: { current: { openCommandPalette } },
        settingsDialogRef: { current: { openSettings } },
        stateRef: {
          current: {
            activePath: 'guide.md',
            editorReadOnlyMode: false,
            showEditorStatusBar: true,
            setEditorReadOnlyMode,
            setShowEditorStatusBar,
            setViewMode,
          },
        },
      }),
    )

    act(() => result.current.openCommandPalette())
    act(() => result.current.openSettings())
    act(() => result.current.toggleReadOnly())
    act(() => result.current.toggleStatusBar())

    expect(openCommandPalette).toHaveBeenCalledOnce()
    expect(openSettings).toHaveBeenCalledOnce()
    expect(setEditorReadOnlyMode).toHaveBeenCalledWith(true)
    expect(setViewMode).toHaveBeenCalledWith('wysiwyg')
    expect(setShowEditorStatusBar).toHaveBeenCalledWith(false)
  })
})
