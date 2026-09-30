import { describe, expect, it, vi } from 'vitest'
import type { EditorView } from '@milkdown/kit/prose/view'
import { pasteTextFromClipboard } from '@/components/milkdown/editorContextMenuClipboard'

describe('pasteTextFromClipboard', () => {
  it('routes clipboard text through ProseMirror paste handling', async () => {
    const view = {
      focus: vi.fn(),
      isDestroyed: false,
      pasteText: vi.fn(() => true),
    } as unknown as EditorView

    await expect(pasteTextFromClipboard(view, async () => 'first\nsecond')).resolves.toBe(true)
    expect(view.focus).toHaveBeenCalledOnce()
    expect(view.pasteText).toHaveBeenCalledWith('first\nsecond')
  })

  it('does not paste after the editor was destroyed', async () => {
    const view = {
      focus: vi.fn(),
      isDestroyed: true,
      pasteText: vi.fn(),
    } as unknown as EditorView

    await expect(pasteTextFromClipboard(view, async () => 'ignored')).resolves.toBe(false)
    expect(view.pasteText).not.toHaveBeenCalled()
  })
})
