import { describe, expect, it, vi } from 'vitest'
import { createPlateEditor } from 'platejs/react'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import {
  getPlateSelectionToolbarMarks,
  runPlateSelectionToolbarAction,
} from '@/components/plate/selection/selectionToolbarActions'

const createEditor = () => {
  const editor = createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: [
      {
        children: [{ text: 'selected text' }],
        type: 'h2',
      },
    ],
  })
  editor.tf.select({
    anchor: { offset: 0, path: [0, 0] },
    focus: { offset: 8, path: [0, 0] },
  })
  return editor
}

describe('Plate selection toolbar actions', () => {
  it.each([
    ['bold', 'bold'],
    ['italic', 'italic'],
    ['strike', 'strikethrough'],
    ['code', 'code'],
  ] as const)('toggles %s on the selected text', (action, mark) => {
    const editor = createEditor()

    expect(runPlateSelectionToolbarAction(editor, action)).toBe(true)

    expect(editor.api.leaf([0, 0])?.[0]).toMatchObject({ [mark]: true })
    expect(getPlateSelectionToolbarMarks(editor)[action]).toBe(true)
  })

  it('delegates link insertion while preserving the selected editor range', () => {
    const editor = createEditor()
    const selection = editor.selection
    const onLink = vi.fn()

    expect(runPlateSelectionToolbarAction(editor, 'link', { onLink })).toBe(true)

    expect(onLink).toHaveBeenCalledWith(editor)
    expect(editor.selection).toEqual(selection)
  })

  it('clears inline marks, links, and the selected block style', () => {
    const editor = createEditor()
    runPlateSelectionToolbarAction(editor, 'bold')
    runPlateSelectionToolbarAction(editor, 'italic')

    expect(runPlateSelectionToolbarAction(editor, 'clear')).toBe(true)

    expect(editor.children[0]).toMatchObject({ type: 'p' })
    expect(editor.api.leaf([0, 0])?.[0]).toEqual({ text: 'selected text' })
  })
})
