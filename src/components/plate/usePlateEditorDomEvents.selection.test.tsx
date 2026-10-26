import { act, renderHook } from '@testing-library/react'
import { BlockSelectionPlugin } from '@platejs/selection/react'
import { createPlateEditor } from 'platejs/react'
import { describe, expect, it, vi } from 'vitest'
import { usePlateEditorDomEvents } from '@/components/plate/usePlateEditorDomEvents'

describe('native selection during block focus handoff', () => {
  it.each([true, false])(
    'clears the old DOM range only for its own block input: %s',
    (ownInput) => {
      const editor = createPlateEditor({ plugins: [BlockSelectionPlugin] })
      const editable = document.createElement('div')
      editable.textContent = 'previous caret'
      const shadow = document.createElement('input')
      const foreign = document.createElement('input')
      document.body.append(editable, shadow, foreign)
      const selection = document.getSelection()!
      const range = document.createRange()
      range.selectNodeContents(editable)
      selection.removeAllRanges()
      selection.addRange(range)
      editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set(['block']))
      editor.setOption(BlockSelectionPlugin, 'shadowInputRef', { current: shadow })
      const flushSnapshot = vi.fn()
      const { unmount } = renderHook(() =>
        usePlateEditorDomEvents({
          editableRef: { current: editable },
          composingRef: { current: false },
          editor,
          readOnly: false,
          isReady: () => true,
          completion: {
            onKeyDown: () => false,
            onBlur: vi.fn(),
            onCompositionStart: vi.fn(),
            onCompositionEnd: vi.fn(),
          },
          applyPendingExternal: () => false,
          flushSnapshot,
          queueSnapshot: vi.fn(),
          onSlashKeyDown: () => false,
          openLinkInput: () => false,
          pickAndImportImage: vi.fn(),
          shortcutOverrides: {},
        }),
      )
      try {
        act(() =>
          editable.dispatchEvent(
            new FocusEvent('blur', { relatedTarget: ownInput ? shadow : foreign }),
          ),
        )
        expect(selection.rangeCount).toBe(ownInput ? 0 : 1)
        expect(editor.getOptions(BlockSelectionPlugin).selectedIds).toEqual(new Set(['block']))
        expect(flushSnapshot).toHaveBeenCalledOnce()
      } finally {
        unmount()
        editable.remove()
        shadow.remove()
        foreign.remove()
        selection.removeAllRanges()
      }
    },
  )
})
