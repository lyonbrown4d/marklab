import { act, renderHook } from '@testing-library/react'
import { createPlateEditor } from 'platejs/react'
import { describe, expect, it, vi } from 'vitest'
import { usePlateEditorDomEvents } from '@/components/plate/usePlateEditorDomEvents'
import { registerVimKeyboardScope } from '@/components/vim/vimKeyboardScope'

vi.mock('@/components/plate/plateEditorShortcuts', () => ({ handlePlateEditorShortcut: vi.fn() }))
vi.mock('@/components/plate/selection/plateBlockSelection', () => ({
  getFocusedTopLevelBlockId: () => null,
  handlePlateBlockMoveShortcut: () => false,
}))

describe('nested Vim editor keyboard priority', () => {
  it('skips parent Plate handlers before the nested Vim engine sees its key', () => {
    const parent = document.createElement('div')
    const nested = document.createElement('div')
    const input = document.createElement('textarea')
    nested.append(input)
    parent.append(nested)
    document.body.append(parent)
    const completionKeyDown = vi.fn(() => false)
    const slashKeyDown = vi.fn(() => false)
    const { unmount } = renderHook(() =>
      usePlateEditorDomEvents({
        editableRef: { current: parent },
        composingRef: { current: false },
        editor: createPlateEditor(),
        readOnly: false,
        isReady: () => true,
        completion: {
          onKeyDown: completionKeyDown,
          onBlur: vi.fn(),
          onCompositionStart: vi.fn(),
          onCompositionEnd: vi.fn(),
        },
        applyPendingExternal: () => false,
        flushSnapshot: vi.fn(),
        queueSnapshot: vi.fn(),
        onSlashKeyDown: slashKeyDown,
        openLinkDialog: () => false,
        pickAndImportImage: vi.fn(),
        shortcutOverrides: {},
      }),
    )
    const release = registerVimKeyboardScope(nested)
    try {
      act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      expect(completionKeyDown).not.toHaveBeenCalled()
      expect(slashKeyDown).not.toHaveBeenCalled()
      release()
      act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      expect(completionKeyDown).toHaveBeenCalledOnce()
      expect(slashKeyDown).toHaveBeenCalledOnce()
    } finally {
      release()
      unmount()
      parent.remove()
    }
  })
})
