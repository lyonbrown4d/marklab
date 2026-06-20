import { describe, expect, it, vi } from 'vitest'
import { executeFocusedEditCommand } from '@/app/focusedEditCommand'

const mockExecCommand = () => {
  const execCommand = vi.fn(() => true)
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: execCommand,
  })
  return execCommand
}

describe('executeFocusedEditCommand', () => {
  it('ignores edit commands when focus is outside an editable target', () => {
    const execCommand = mockExecCommand()
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()

    expect(executeFocusedEditCommand('edit.copy')).toBe(false)
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('runs document edit commands only for the focused editable target', () => {
    const execCommand = mockExecCommand()
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.tabIndex = 0
    editor.textContent = 'Alpha'
    document.body.append(editor)
    editor.focus()

    expect(executeFocusedEditCommand('edit.copy')).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('recognizes focused ProseMirror editor roots as editable targets', () => {
    const execCommand = mockExecCommand()
    const editor = document.createElement('div')
    editor.className = 'ProseMirror'
    editor.tabIndex = 0
    document.body.append(editor)
    editor.focus()

    expect(executeFocusedEditCommand('edit.undo')).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('undo')
  })

  it('selects text inputs directly instead of using document selectAll', () => {
    const execCommand = mockExecCommand()
    const input = document.createElement('input')
    input.value = 'Alpha'
    document.body.append(input)
    input.focus()

    expect(executeFocusedEditCommand('edit.select_all')).toBe(true)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('selects contenteditable editor contents directly instead of using document selectAll', () => {
    const execCommand = mockExecCommand()
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.tabIndex = 0
    editor.textContent = 'Alpha Beta'
    document.body.append(editor)
    editor.focus()

    expect(executeFocusedEditCommand('edit.select_all')).toBe(true)
    const selection = document.getSelection()
    const range = selection?.getRangeAt(0)
    expect(range?.startContainer).toBe(editor)
    expect(range?.endContainer).toBe(editor)
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('ignores unknown edit actions', () => {
    const execCommand = mockExecCommand()
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()

    expect(executeFocusedEditCommand('edit.unknown')).toBe(false)
    expect(execCommand).not.toHaveBeenCalled()
  })
})
