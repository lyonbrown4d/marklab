import type { TElement } from 'platejs'
import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import {
  blockActionTypes,
  getBlockActionAvailability,
  runBlockAction,
} from '@/components/plate/nodes/blockActions'

const paragraph = (id: string, text: string): TElement => ({
  children: [{ text }],
  id,
  type: 'p',
})

const createEditor = () =>
  createPlateEditor({
    nodeId: true,
    value: [paragraph('first', 'First'), paragraph('second', 'Second')],
  })

describe('block actions', () => {
  it.each(blockActionTypes)('turns a block into %s', (type) => {
    const editor = createEditor()
    const block = editor.children[0] as TElement

    runBlockAction(editor, block, { kind: 'setType', type })

    expect(editor.children[0]).toMatchObject({ id: 'first', type })
  })

  it('undoes block conversion as one history operation', () => {
    const editor = createEditor()

    runBlockAction(editor, editor.children[0] as TElement, { kind: 'setType', type: 'h2' })
    editor.undo()

    expect(editor.children[0]).toMatchObject({ id: 'first', type: 'p' })
  })

  it('duplicates a block after the source with a fresh node id', () => {
    const editor = createEditor()

    const duplicate = runBlockAction(editor, editor.children[0] as TElement, {
      kind: 'duplicate',
    })

    expect(editor.children).toHaveLength(3)
    expect(editor.children[1]).toMatchObject({ children: [{ text: 'First' }], type: 'p' })
    expect((editor.children[1] as TElement).id).not.toBe('first')
    expect(duplicate).toBe(editor.children[1])
  })

  it('undoes duplication as one history operation', () => {
    const editor = createEditor()

    runBlockAction(editor, editor.children[0] as TElement, { kind: 'duplicate' })
    editor.undo()

    expect(editor.children.map((node) => (node as TElement).id)).toEqual(['first', 'second'])
  })

  it('moves blocks and refuses to cross document boundaries', () => {
    const editor = createEditor()
    const first = editor.children[0] as TElement
    const second = editor.children[1] as TElement

    expect(runBlockAction(editor, first, { kind: 'moveUp' })).toBeUndefined()
    expect(runBlockAction(editor, second, { kind: 'moveDown' })).toBeUndefined()
    expect(editor.children.map((node) => (node as TElement).id)).toEqual(['first', 'second'])

    runBlockAction(editor, first, { kind: 'moveDown' })
    expect(editor.children.map((node) => (node as TElement).id)).toEqual(['second', 'first'])
    editor.undo()
    expect(editor.children.map((node) => (node as TElement).id)).toEqual(['first', 'second'])
  })

  it('reports movement availability at both boundaries', () => {
    const editor = createEditor()

    expect(getBlockActionAvailability(editor, editor.children[0] as TElement)).toEqual({
      canMoveDown: true,
      canMoveUp: false,
      canSetType: true,
    })
    expect(getBlockActionAvailability(editor, editor.children[1] as TElement)).toEqual({
      canMoveDown: false,
      canMoveUp: true,
      canSetType: true,
    })
  })

  it('does not convert structured blocks into invalid text blocks', () => {
    const editor = createEditor()
    const table = { children: [], id: 'table', type: 'table' } as unknown as TElement
    editor.tf.insertNodes(table, { at: [1] })

    expect(getBlockActionAvailability(editor, table).canSetType).toBe(false)
    expect(runBlockAction(editor, table, { kind: 'setType', type: 'p' })).toBeUndefined()
    expect(editor.children[1]).toMatchObject({ type: 'table' })
  })

  it('deletes a block and returns its adjacent focus target', () => {
    const editor = createEditor()
    const second = editor.children[1] as TElement

    const focusTarget = runBlockAction(editor, editor.children[0] as TElement, { kind: 'delete' })

    expect(editor.children.map((node) => (node as TElement).id)).toEqual(['second'])
    expect(focusTarget).toBe(second)
    editor.undo()
    expect(editor.children.map((node) => (node as TElement).id)).toEqual(['first', 'second'])
  })

  it('keeps an empty paragraph when deleting the final block', () => {
    const editor = createPlateEditor({ nodeId: true, value: [paragraph('only', 'Only')] })

    runBlockAction(editor, editor.children[0] as TElement, { kind: 'delete' })

    expect(editor.children).toEqual([
      expect.objectContaining({ children: [{ text: '' }], type: 'p' }),
    ])
    editor.undo()
    expect(editor.children).toEqual([paragraph('only', 'Only')])
  })
})
