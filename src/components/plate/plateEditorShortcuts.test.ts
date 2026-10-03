import { createPlateEditor } from 'platejs/react'
import { describe, expect, it, vi } from 'vitest'
import {
  handlePlateEditorBoundaryShortcut,
  handlePlateEditorShortcut,
  resolvePlateFormattingShortcut,
} from '@/components/plate/plateEditorShortcuts'

const keyboardEvent = (key: string, modifiers: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', {
    cancelable: true,
    ctrlKey: true,
    key,
    ...modifiers,
  })

describe('Plate formatting shortcut resolution', () => {
  it.each([
    ['b', {}, 'editor.bold'],
    ['I', {}, 'editor.italic'],
    ['e', {}, 'editor.inlineCode'],
    ['X', { shiftKey: true }, 'editor.strike'],
    ['k', {}, 'editor.link'],
    ['b', { ctrlKey: false, metaKey: true }, 'editor.bold'],
  ] as const)('resolves %s with platform modifier semantics', (key, modifiers, action) => {
    expect(resolvePlateFormattingShortcut(keyboardEvent(key, modifiers), {})).toBe(action)
  })

  it.each([
    ['b', { ctrlKey: false }],
    ['b', { altKey: true }],
    ['b', { shiftKey: true }],
    ['x', {}],
    ['k', { shiftKey: true }],
  ] as const)('rejects unsupported modifiers for %s', (key, modifiers) => {
    expect(resolvePlateFormattingShortcut(keyboardEvent(key, modifiers), {})).toBeNull()
  })

  it('defers to a persisted override instead of claiming the built-in fallback', () => {
    expect(
      resolvePlateFormattingShortcut(keyboardEvent('b'), {
        'editor.bold': ['F8'],
      }),
    ).toBeNull()
  })

  it('does not run shortcuts for IME key events', () => {
    const editor = createPlateEditor({ value: [{ type: 'p', children: [{ text: 'text' }] }] })
    const event = keyboardEvent('b', { isComposing: true })
    const preventDefault = vi.spyOn(event, 'preventDefault')

    expect(handlePlateEditorShortcut(editor, event)).toBe(false)
    expect(preventDefault).not.toHaveBeenCalled()
    expect(editor.children).toEqual([{ type: 'p', children: [{ text: 'text' }] }])
  })

  it('moves the Slate selection to document boundaries without DOM traversal', () => {
    const editor = createPlateEditor({
      value: [
        { type: 'p', children: [{ text: 'first' }] },
        { type: 'p', children: [{ text: 'last' }] },
      ],
    })
    editor.tf.select(editor.api.start([]))
    const endEvent = keyboardEvent('End')

    expect(handlePlateEditorBoundaryShortcut(editor, endEvent)).toBe(true)
    expect(editor.selection).toEqual({
      anchor: { offset: 4, path: [1, 0] },
      focus: { offset: 4, path: [1, 0] },
    })
    expect(endEvent.defaultPrevented).toBe(true)
  })
})
