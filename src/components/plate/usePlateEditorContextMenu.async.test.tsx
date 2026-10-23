import { act, renderHook } from '@testing-library/react'
import { createPlateEditor } from 'platejs/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { plateMarkdownPlugins } from '@/components/plate/plateMarkdownConfig'
import { usePlateEditorContextMenu } from '@/components/plate/usePlateEditorContextMenu'
import { readClipboardText, writeClipboardContent } from '@/runtime/clipboard'
import { queueFocusedEditCommand } from '@/runtime/editCommands'

vi.mock('@/runtime/clipboard', () => ({
  readClipboardText: vi.fn(),
  writeClipboardContent: vi.fn(),
  writeClipboardText: vi.fn(),
}))
vi.mock('@/runtime/editCommands', () => ({ queueFocusedEditCommand: vi.fn() }))

const createEditor = () => {
  const editor = createPlateEditor({
    plugins: [...plateMarkdownPlugins],
    value: [{ type: 'p', children: [{ text: 'Hello' }] }],
  })
  editor.tf.select({
    anchor: { path: [0, 0], offset: 0 },
    focus: { path: [0, 0], offset: 5 },
  })
  return editor
}

beforeEach(() => vi.clearAllMocks())

describe('asynchronous context menu clipboard actions', () => {
  it.each(['cut', 'pasteAsPlainText'] as const)(
    'keeps %s anchored while edits before the selection move it',
    async (action) => {
      const editor = createEditor()
      let finish!: () => void
      if (action === 'cut') {
        vi.mocked(writeClipboardContent).mockReturnValue(
          new Promise((resolve) => {
            finish = resolve
          }),
        )
      } else {
        vi.mocked(readClipboardText).mockReturnValue(
          new Promise((resolve) => {
            finish = () => resolve('raw')
          }),
        )
      }
      const { result } = renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))
      act(() => result.current.onAction(action))
      act(() => {
        editor.tf.withNewBatch(() =>
          editor.tf.insertText('Prefix ', { at: { path: [0, 0], offset: 0 } }),
        )
        editor.tf.select({ path: [0, 0], offset: 0 })
      })

      await act(async () => finish())

      expect(editor.api.string([])).toBe(action === 'cut' ? 'Prefix ' : 'Prefix raw')
      expect(editor.selection?.anchor.offset).toBe(action === 'cut' ? 7 : 10)
      editor.undo()
      expect(editor.api.string([])).toBe('Prefix Hello')
    },
  )

  it('keeps content intact when writing the clipboard fails', async () => {
    const editor = createEditor()
    vi.mocked(writeClipboardContent).mockRejectedValue(new Error('Clipboard unavailable'))
    const { result } = renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))

    await act(async () => result.current.onAction('cut'))

    expect(editor.api.string([])).toBe('Hello')
    expect(queueFocusedEditCommand).not.toHaveBeenCalled()
  })

  it.each(['cut', 'pasteAsPlainText'] as const)(
    'cancels pending %s when the document becomes inactive',
    async (action) => {
      const editor = createEditor()
      let finish!: () => void
      if (action === 'cut') {
        vi.mocked(writeClipboardContent).mockReturnValue(
          new Promise((resolve) => {
            finish = resolve
          }),
        )
      } else {
        vi.mocked(readClipboardText).mockReturnValue(
          new Promise((resolve) => {
            finish = () => resolve('raw')
          }),
        )
      }
      const { result, rerender } = renderHook(
        ({ interactionActive }) =>
          usePlateEditorContextMenu({
            activePath: 'note.md',
            getEditor: () => editor,
            interactionActive,
          }),
        { initialProps: { interactionActive: true } },
      )
      act(() => result.current.onAction(action))
      rerender({ interactionActive: false })

      await act(async () => finish())

      expect(editor.api.string([])).toBe('Hello')
    },
  )

  it('cancels a pending cut if the selected formatting changes without changing its text', async () => {
    const editor = createEditor()
    let finish!: () => void
    vi.mocked(writeClipboardContent).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { result } = renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))
    act(() => result.current.onAction('cut'))
    act(() => editor.tf.addMark('bold', true))
    await act(async () => finish())
    expect(editor.api.string([])).toBe('Hello')
    expect(editor.children[0]).toMatchObject({ children: [{ text: 'Hello', bold: true }] })
  })

  it('cancels a pending cut if its selected content was edited', async () => {
    const editor = createEditor()
    let finish!: () => void
    vi.mocked(writeClipboardContent).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { result } = renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))
    act(() => result.current.onAction('cut'))
    act(() => editor.tf.insertText('!', { at: { path: [0, 0], offset: 2 } }))

    await act(async () => finish())

    expect(editor.api.string([])).toBe('He!llo')
  })

  it('does not paste into a different document that reuses the editor', async () => {
    const editor = createEditor()
    let finish!: (text: string) => void
    vi.mocked(readClipboardText).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { result, rerender } = renderHook(
      ({ activePath }) => usePlateEditorContextMenu({ activePath, getEditor: () => editor }),
      { initialProps: { activePath: 'first.md' } },
    )
    act(() => result.current.onAction('pasteAsPlainText'))
    rerender({ activePath: 'second.md' })

    await act(async () => finish('raw'))

    expect(editor.api.string([])).toBe('Hello')
  })

  it.each(['replace', 'unmount'])(
    'does not paste after the editor lifecycle changes: %s',
    async (change) => {
      let editor = createEditor()
      const previous = editor
      let finish!: (text: string) => void
      vi.mocked(readClipboardText).mockReturnValue(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      const { result, unmount } = renderHook(() =>
        usePlateEditorContextMenu({ getEditor: () => editor }),
      )
      act(() => result.current.onAction('pasteAsPlainText'))
      if (change === 'replace') editor = createEditor()
      else unmount()

      await act(async () => finish('raw'))

      expect(previous.api.string([])).toBe('Hello')
      expect(editor.api.string([])).toBe('Hello')
    },
  )
})
