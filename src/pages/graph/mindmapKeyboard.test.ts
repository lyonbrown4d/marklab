import { describe, expect, it } from 'vitest'
import { resolveMindmapKeyboardCommand } from '@/pages/graph/mindmapKeyboard'

const keyboard = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key, bubbles: true, ...init })

describe('mindmap keyboard contract', () => {
  it.each([
    ['Enter', {}, 'add-sibling'],
    ['Tab', {}, 'add-child'],
    ['Enter', { ctrlKey: true }, 'add-parent'],
    ['F2', {}, 'edit'],
    [' ', {}, 'edit'],
    ['Delete', {}, 'delete'],
    ['ArrowLeft', {}, 'navigate-left'],
    ['ArrowDown', { altKey: true }, 'reorder-down'],
    ['/', { ctrlKey: true }, 'toggle-fold'],
    ['z', { ctrlKey: true }, 'undo'],
    ['z', { metaKey: true, shiftKey: true }, 'redo'],
    ['r', { ctrlKey: true }, 'center-root'],
  ] as const)('maps %s to %s', (key, init, command) => {
    expect(resolveMindmapKeyboardCommand(keyboard(key, init), true)).toBe(command)
  })

  it('does not steal editing, composition, or unselected destructive shortcuts', () => {
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    document.body.append(editor)
    const editingEvent = keyboard('Enter')
    Object.defineProperty(editingEvent, 'target', { value: editor })

    expect(resolveMindmapKeyboardCommand(editingEvent, true)).toBeNull()
    expect(resolveMindmapKeyboardCommand(keyboard('Enter', { isComposing: true }), true)).toBeNull()
    expect(resolveMindmapKeyboardCommand(keyboard('Delete'), false)).toBeNull()
    editor.remove()
  })
})
