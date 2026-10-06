import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeFocusedEditCommand } from '@/app/focusedEditCommand'
import { clearFocusedCodeEditor, setFocusedCodeEditor } from '@/lib/focusedCodeEditor'

const createNativeExecutor = () => vi.fn(() => true)

const createCodeEditor = () => {
  const editor = {
    focus: vi.fn(),
    trigger: vi.fn(),
  }
  return editor
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('executeFocusedEditCommand', () => {
  it('ignores edit commands when focus is outside an editable target', () => {
    const executeNative = createNativeExecutor()
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()

    expect(executeFocusedEditCommand('edit.copy', document, executeNative)).toBe(false)
    expect(executeNative).not.toHaveBeenCalled()
  })

  it('routes native edit commands only for the focused editable target', () => {
    const executeNative = createNativeExecutor()
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.tabIndex = 0
    editor.textContent = 'Alpha'
    document.body.append(editor)
    editor.focus()

    expect(executeFocusedEditCommand('edit.copy', document, executeNative)).toBe(true)
    expect(executeNative).toHaveBeenCalledWith('copy')
  })

  it('recognizes focused Slate editor roots as editable targets', () => {
    const executeNative = createNativeExecutor()
    const editor = document.createElement('div')
    editor.dataset.slateEditor = 'true'
    editor.setAttribute('contenteditable', 'true')
    editor.tabIndex = 0
    document.body.append(editor)
    editor.focus()

    expect(executeFocusedEditCommand('edit.undo', document, executeNative)).toBe(true)
    expect(executeNative).toHaveBeenCalledWith('undo')
  })

  it('routes source editor edit commands to Monaco when focus is inside the editor', () => {
    const executeNative = createNativeExecutor()
    const editor = createCodeEditor()
    const host = document.createElement('div')
    const inputArea = document.createElement('textarea')
    host.className = 'monaco-editor'
    host.append(inputArea)
    document.body.append(host)
    inputArea.focus()
    setFocusedCodeEditor(editor as never)

    expect(executeFocusedEditCommand('edit.paste', document, executeNative)).toBe(true)
    expect(editor.focus).toHaveBeenCalled()
    expect(editor.trigger).toHaveBeenCalledWith(
      'marklab.editMenu',
      'editor.action.clipboardPasteAction',
      null,
    )
    expect(executeNative).not.toHaveBeenCalled()

    clearFocusedCodeEditor(editor as never)
  })

  it('keeps native menu edit commands available for the last focused source editor', () => {
    const editor = createCodeEditor()
    document.body.tabIndex = -1
    document.body.focus()
    setFocusedCodeEditor(editor as never)

    expect(executeFocusedEditCommand('edit.copy')).toBe(true)
    expect(editor.trigger).toHaveBeenCalledWith(
      'marklab.editMenu',
      'editor.action.clipboardCopyAction',
      null,
    )

    clearFocusedCodeEditor(editor as never)
  })

  it('selects text inputs directly instead of using document selectAll', () => {
    const executeNative = createNativeExecutor()
    const input = document.createElement('input')
    input.value = 'Alpha'
    document.body.append(input)
    input.focus()

    expect(executeFocusedEditCommand('edit.select_all', document, executeNative)).toBe(true)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
    expect(executeNative).not.toHaveBeenCalled()
  })

  it('selects contenteditable editor contents directly instead of using document selectAll', () => {
    const executeNative = createNativeExecutor()
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.tabIndex = 0
    editor.textContent = 'Alpha Beta'
    document.body.append(editor)
    editor.focus()

    expect(executeFocusedEditCommand('edit.select_all', document, executeNative)).toBe(true)
    const selection = document.getSelection()
    const range = selection?.getRangeAt(0)
    expect(range?.startContainer).toBe(editor)
    expect(range?.endContainer).toBe(editor)
    expect(executeNative).not.toHaveBeenCalled()
  })

  it('ignores unknown edit actions', () => {
    const executeNative = createNativeExecutor()
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()

    expect(executeFocusedEditCommand('edit.unknown', document, executeNative)).toBe(false)
    expect(executeNative).not.toHaveBeenCalled()
  })
})
