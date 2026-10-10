import { DndPlugin } from '@platejs/dnd'
import { BlockSelectionPlugin } from '@platejs/selection/react'
import type { TElement } from 'platejs'
import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import {
  handlePlateBlockMoveShortcut,
  handlePlateBlockSelectionShortcut,
  getFocusedTopLevelBlockId,
  moveSelectedBlocks,
  selectBlockFromHandle,
  setBlockSelectionTarget,
} from '@/components/plate/selection/plateBlockSelection'

const paragraph = (id: string): TElement => ({
  children: [{ text: id.toUpperCase() }],
  id,
  type: 'p',
})

const createEditor = () =>
  createPlateEditor({
    plugins: [BlockSelectionPlugin, DndPlugin],
    value: ['a', 'b', 'c', 'd', 'e'].map(paragraph),
  })

const selectedIds = (editor: ReturnType<typeof createEditor>) => [
  ...(editor.getOptions(BlockSelectionPlugin).selectedIds ?? []),
]

const order = (editor: ReturnType<typeof createEditor>) => editor.children.map((node) => node.id)

describe('Plate block selection', () => {
  it('uses Space to select one block and toggle the sole selection off', () => {
    const editor = createEditor()
    const select = new KeyboardEvent('keydown', { cancelable: true, key: ' ' })

    expect(handlePlateBlockSelectionShortcut(editor, select, 'b')).toBe(true)
    expect(select.defaultPrevented).toBe(true)
    expect(selectedIds(editor)).toEqual(['b'])

    const toggle = new KeyboardEvent('keydown', { cancelable: true, key: ' ' })
    expect(handlePlateBlockSelectionShortcut(editor, toggle, 'b')).toBe(true)
    expect(selectedIds(editor)).toEqual([])
  })

  it('uses the primary modifier with Space for a disjoint selection', () => {
    const editor = createEditor()

    handlePlateBlockSelectionShortcut(
      editor,
      new KeyboardEvent('keydown', { cancelable: true, key: ' ' }),
      'a',
    )
    handlePlateBlockSelectionShortcut(
      editor,
      new KeyboardEvent('keydown', { cancelable: true, ctrlKey: true, key: ' ' }),
      'c',
    )
    handlePlateBlockSelectionShortcut(
      editor,
      new KeyboardEvent('keydown', { cancelable: true, key: ' ', metaKey: true }),
      'e',
    )

    expect(selectedIds(editor)).toEqual(['a', 'c', 'e'])
  })

  it('uses Shift+Space to extend a continuous range from the keyboard anchor', () => {
    const editor = createEditor()

    handlePlateBlockSelectionShortcut(
      editor,
      new KeyboardEvent('keydown', { cancelable: true, key: ' ' }),
      'b',
    )
    handlePlateBlockSelectionShortcut(
      editor,
      new KeyboardEvent('keydown', { cancelable: true, key: ' ', shiftKey: true }),
      'd',
    )

    expect(selectedIds(editor)).toEqual(['b', 'c', 'd'])
  })

  it('ignores Space while IME composition is active', () => {
    const editor = createEditor()
    const event = new KeyboardEvent('keydown', { cancelable: true, key: ' ' })
    Object.defineProperty(event, 'isComposing', { value: true })

    expect(handlePlateBlockSelectionShortcut(editor, event, 'b')).toBe(false)
    expect(selectedIds(editor)).toEqual([])
  })

  it('extends a contiguous range from the official selection anchor with Shift', () => {
    const editor = createEditor()

    selectBlockFromHandle(editor, 'b', {})
    selectBlockFromHandle(editor, 'd', { shiftKey: true })

    expect(selectedIds(editor)).toEqual(['b', 'c', 'd'])
    expect(editor.getOption(BlockSelectionPlugin, 'anchorId')).toBe('b')
  })

  it('toggles disjoint blocks with the platform primary modifier', () => {
    const editor = createEditor()

    selectBlockFromHandle(editor, 'a', {})
    selectBlockFromHandle(editor, 'c', { ctrlKey: true })
    selectBlockFromHandle(editor, 'e', { metaKey: true })
    selectBlockFromHandle(editor, 'c', { ctrlKey: true })

    expect(selectedIds(editor)).toEqual(['a', 'e'])
    expect(editor.getOption(DndPlugin, 'draggingId')).toEqual(['a', 'e'])
  })

  it('moves selected blocks together and keeps the operation undoable', () => {
    const editor = createEditor()
    selectBlockFromHandle(editor, 'b', {})
    selectBlockFromHandle(editor, 'c', { ctrlKey: true })

    expect(moveSelectedBlocks(editor, 'down')).toBe(true)
    expect(order(editor)).toEqual(['a', 'd', 'b', 'c', 'e'])

    editor.undo()
    expect(order(editor)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('moves a disjoint selection as one history operation', () => {
    const editor = createEditor()
    selectBlockFromHandle(editor, 'b', {})
    selectBlockFromHandle(editor, 'd', { ctrlKey: true })

    expect(moveSelectedBlocks(editor, 'down')).toBe(true)
    expect(order(editor)).toEqual(['a', 'c', 'b', 'e', 'd'])
    expect(selectedIds(editor)).toEqual(['b', 'd'])

    editor.undo()
    expect(order(editor)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('does not move a group beyond the document edge', () => {
    const editor = createEditor()
    selectBlockFromHandle(editor, 'b', {})
    selectBlockFromHandle(editor, 'e', { ctrlKey: true })

    expect(moveSelectedBlocks(editor, 'down')).toBe(false)
    expect(order(editor)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('preserves the Slate text range while selecting from block handles', () => {
    const editor = createEditor()
    editor.tf.select({ anchor: { offset: 0, path: [1, 0] }, focus: { offset: 1, path: [2, 0] } })
    const textSelection = editor.selection

    selectBlockFromHandle(editor, 'b', {})
    selectBlockFromHandle(editor, 'd', { shiftKey: true })

    expect(editor.selection).toEqual(textSelection)
    expect(selectedIds(editor)).toEqual(['b', 'c', 'd'])
  })

  it('replaces a stale block selection with the operation target', () => {
    const editor = createEditor()
    selectBlockFromHandle(editor, 'a', {})
    selectBlockFromHandle(editor, 'c', { ctrlKey: true })

    setBlockSelectionTarget(editor, editor.children[1] as TElement)

    expect(selectedIds(editor)).toEqual(['b'])
    expect(editor.getOption(BlockSelectionPlugin, 'anchorId')).toBe('b')
    expect(editor.getOption(DndPlugin, 'draggingId')).toBe('b')
  })

  it('moves the focused block with Alt+Arrow and ignores IME composition', () => {
    const editor = createEditor()
    const composing = new KeyboardEvent('keydown', {
      altKey: true,
      key: 'ArrowDown',
    })
    Object.defineProperty(composing, 'isComposing', { value: true })

    expect(handlePlateBlockMoveShortcut(editor, composing, 'b')).toBe(false)
    expect(order(editor)).toEqual(['a', 'b', 'c', 'd', 'e'])

    const event = new KeyboardEvent('keydown', {
      altKey: true,
      cancelable: true,
      key: 'ArrowDown',
    })
    expect(handlePlateBlockMoveShortcut(editor, event, 'b')).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(order(editor)).toEqual(['a', 'c', 'b', 'd', 'e'])
  })

  it('resolves the top-level block owning the text caret', () => {
    const editor = createEditor()
    editor.tf.select(editor.api.start([2]))

    expect(getFocusedTopLevelBlockId(editor)).toBe('c')
  })
})
