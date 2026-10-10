import { act, renderHook, waitFor } from '@testing-library/react'
import { createPlateEditor } from 'platejs/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { plateMarkdownPlugins } from '@/components/plate/plateMarkdownConfig'
import { usePlateEditorContextMenu } from '@/components/plate/usePlateEditorContextMenu'
import { queueFocusedEditCommand } from '@/runtime/editCommands'
import { readClipboardText, writeClipboardContent, writeClipboardText } from '@/runtime/clipboard'

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

const dispatchClipboardEvent = (
  target: HTMLElement,
  type: 'copy' | 'cut' | 'paste',
  initial: Record<string, string> = {},
) => {
  const values = new Map(Object.entries(initial))
  const event = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (format: string) => values.get(format) ?? '',
      setData: (format: string, value: string) => {
        values.set(format, value)
      },
      types: [...values.keys()],
    },
  })
  target.dispatchEvent(event)
  return { event, values }
}

const createClipboardTarget = (editor: ReturnType<typeof createEditor>) => {
  const target = document.createElement('div')
  target.className = 'markdown-editor'
  target.innerHTML = '<p><strong>Hello</strong></p>'
  document.body.append(target)
  vi.spyOn(editor.api, 'toDOMNode').mockReturnValue(target)
  return target
}

beforeEach(() => {
  vi.mocked(readClipboardText).mockReset()
  vi.mocked(writeClipboardContent).mockReset().mockResolvedValue(undefined)
  vi.mocked(writeClipboardText).mockReset().mockResolvedValue(undefined)
  vi.mocked(queueFocusedEditCommand).mockReset()
})

describe('usePlateEditorContextMenu', () => {
  it('copies Markdown alone or publishes default text and HTML formats', async () => {
    const editor = createEditor()
    const { result } = renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))

    act(() => result.current.onAction('copyAsMarkdown'))
    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith('Hello'))

    act(() => result.current.onAction('copy'))
    await waitFor(() =>
      expect(writeClipboardContent).toHaveBeenCalledWith({
        html: undefined,
        markdown: 'Hello',
        text: 'Hello',
      }),
    )
  })

  it('uses the native edit command for normal paste', () => {
    const editor = createEditor()
    const { result } = renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))

    act(() => result.current.onAction('paste'))

    expect(queueFocusedEditCommand).toHaveBeenCalledWith('paste')
    expect(readClipboardText).not.toHaveBeenCalled()
  })

  it('pastes clipboard Markdown as literal text only when requested', async () => {
    const editor = createEditor()
    editor.tf.select({ path: [0, 0], offset: 5 })
    vi.mocked(readClipboardText).mockResolvedValue(' **raw**')
    const { result } = renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))

    act(() => result.current.onAction('pasteAsPlainText'))

    await waitFor(() => expect(editor.api.string([])).toBe('Hello **raw**'))
    expect(editor.selection).toEqual({
      anchor: { offset: 13, path: [0, 0] },
      focus: { offset: 13, path: [0, 0] },
    })
    editor.undo()
    expect(editor.api.string([])).toBe('Hello')
  })

  it('writes Markdown text and selected HTML through a native copy event', () => {
    const editor = createEditor()
    const target = createClipboardTarget(editor)
    const range = document.createRange()
    range.selectNode(target.querySelector('strong')!)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))

    const { event, values } = dispatchClipboardEvent(target, 'copy')

    expect(event.defaultPrevented).toBe(true)
    expect(values.get('text/plain')).toBe('Hello')
    expect(values.get('text/markdown')).toBe('Hello')
    expect(values.get('text/html')).toBe('<strong>Hello</strong>')
    target.remove()
    window.getSelection()!.removeAllRanges()
  })

  it('handles native copy when Plate dispatches from its shadow input', () => {
    const editor = createEditor()
    const target = createClipboardTarget(editor)
    const shadowInput = document.createElement('textarea')
    const range = document.createRange()
    range.selectNodeContents(target.querySelector('strong')!)
    document.body.append(shadowInput)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))

    const { event, values } = dispatchClipboardEvent(shadowInput, 'copy')

    expect(event.defaultPrevented).toBe(true)
    expect(values.get('text/markdown')).toBe('Hello')
    expect(values.get('text/html')).toBe('<strong>Hello</strong>')
    shadowInput.remove()
    target.remove()
    window.getSelection()!.removeAllRanges()
  })

  it('keeps native cut semantics while publishing Markdown formats', () => {
    const editor = createEditor()
    const target = createClipboardTarget(editor)
    renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))

    const { event, values } = dispatchClipboardEvent(target, 'cut')

    expect(event.defaultPrevented).toBe(true)
    expect(values.get('text/plain')).toBe('Hello')
    expect(values.get('text/markdown')).toBe('Hello')
    expect(editor.api.string([])).toBe('')
    expect(editor.selection).toEqual({
      anchor: { offset: 0, path: [0, 0] },
      focus: { offset: 0, path: [0, 0] },
    })
    editor.undo()
    expect(editor.api.string([])).toBe('Hello')
    target.remove()
  })

  it('places the caret at the cut start and undoes an explicit cut atomically', async () => {
    const editor = createEditor()
    const { result } = renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))

    act(() => result.current.onAction('cut'))

    await waitFor(() => expect(editor.api.string([])).toBe(''))
    expect(editor.selection).toEqual({
      anchor: { offset: 0, path: [0, 0] },
      focus: { offset: 0, path: [0, 0] },
    })
    editor.undo()
    expect(editor.api.string([])).toBe('Hello')
  })

  it('leaves DOM paste events to Plate so rich HTML can be preserved', () => {
    const editor = createEditor()
    editor.tf.select({ path: [0, 0], offset: 5 })
    const target = createClipboardTarget(editor)
    renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))

    const { event } = dispatchClipboardEvent(target, 'paste', {
      'text/html': '<strong>raw</strong>',
      'text/plain': '**raw**',
    })

    expect(event.defaultPrevented).toBe(false)
    expect(editor.api.string([])).toBe('Hello')
    target.remove()
  })

  it('leaves image-only paste events for the existing asset handler', () => {
    const editor = createEditor()
    const target = createClipboardTarget(editor)
    renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))

    const { event } = dispatchClipboardEvent(target, 'paste', { 'image/png': '' })

    expect(event.defaultPrevented).toBe(false)
    expect(editor.api.string([])).toBe('Hello')
    target.remove()
  })

  it('disables selection actions for an empty selection', () => {
    const editor = createEditor()
    editor.tf.select({ path: [0, 0], offset: 2 })
    const { result } = renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))

    expect(result.current.getCapabilities()).toMatchObject({
      copy: false,
      copyAsMarkdown: false,
      cut: false,
    })
    act(() => result.current.onAction('copy'))
    expect(writeClipboardContent).not.toHaveBeenCalled()
  })

  it('leaves native copy untouched for an empty selection', () => {
    const editor = createEditor()
    editor.tf.select({ path: [0, 0], offset: 2 })
    const target = createClipboardTarget(editor)
    renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor }))

    const { event, values } = dispatchClipboardEvent(target, 'copy')

    expect(event.defaultPrevented).toBe(false)
    expect(values.size).toBe(0)
    target.remove()
  })

  it('allows copy but blocks mutating actions in read-only mode', async () => {
    const editor = createEditor()
    vi.mocked(readClipboardText).mockResolvedValue('changed')
    const { result } = renderHook(() =>
      usePlateEditorContextMenu({ getEditor: () => editor, readOnly: true }),
    )

    expect(result.current.getCapabilities()).toMatchObject({
      copy: true,
      copyAsMarkdown: true,
      cut: false,
      paste: false,
      pasteAsPlainText: false,
    })
    act(() => {
      result.current.onAction('copyAsMarkdown')
      result.current.onAction('pasteAsPlainText')
      result.current.onAction('cut')
    })

    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith('Hello'))
    expect(readClipboardText).not.toHaveBeenCalled()
    expect(queueFocusedEditCommand).not.toHaveBeenCalled()
  })

  it('blocks native cut and leaves read-only paste to the editor surface', () => {
    const editor = createEditor()
    const target = createClipboardTarget(editor)
    renderHook(() => usePlateEditorContextMenu({ getEditor: () => editor, readOnly: true }))

    const cut = dispatchClipboardEvent(target, 'cut')
    const paste = dispatchClipboardEvent(target, 'paste', { 'text/plain': 'changed' })

    expect(cut.event.defaultPrevented).toBe(true)
    expect(paste.event.defaultPrevented).toBe(false)
    expect(editor.api.string([])).toBe('Hello')
    target.remove()
  })
})
