import { describe, expect, it, vi } from 'vitest'
import { createPlateEditor } from 'platejs/react'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import {
  plateSelectionToolbarMoreActions,
  runPlateSelectionToolbarMoreAction,
} from '@/components/plate/selection/selectionToolbarMoreActions'

const createEditor = () => {
  const editor = createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: [{ children: [{ text: 'selected text' }], type: 'p' }],
  })
  editor.tf.select({
    anchor: { offset: 0, path: [0, 0] },
    focus: { offset: 8, path: [0, 0] },
  })
  return editor
}

describe('selection toolbar more actions', () => {
  it.each([
    ['paragraph', 'p'],
    ['heading1', 'h1'],
    ['heading2', 'h2'],
    ['heading3', 'h3'],
  ] as const)('converts the selected block with %s', (action, type) => {
    const editor = createEditor()

    expect(runPlateSelectionToolbarMoreAction(editor, action)).toBe(true)

    expect(editor.children[0]).toMatchObject({ type })
  })

  it('wraps the selection in a quote and keeps it editable', () => {
    const editor = createEditor()

    expect(runPlateSelectionToolbarMoreAction(editor, 'quote')).toBe(true)
    expect(editor.children[0]).toMatchObject({
      children: [{ children: [{ text: 'selected text' }], type: 'p' }],
      type: 'blockquote',
    })
    expect(editor.selection).not.toBeNull()

    editor.tf.insertText('changed')
    expect(editor.api.string([])).toBe('changed text')
  })

  it('undoes the quote transform as one history batch', () => {
    const editor = createEditor()

    expect(runPlateSelectionToolbarMoreAction(editor, 'quote')).toBe(true)
    editor.undo()

    expect(editor.children[0]).toMatchObject({ type: 'p' })
    expect(editor.api.string([])).toBe('selected text')
  })

  it('copies the selected fragment as Markdown', () => {
    const editor = createEditor()
    editor.tf.toggleMark('bold')
    const writeText = vi.fn(() => Promise.resolve())

    expect(runPlateSelectionToolbarMoreAction(editor, 'copyMarkdown', { writeText })).toBe(true)
    expect(writeText).toHaveBeenCalledWith('**selected**')
  })

  it('reports clipboard failures through the action error callback', async () => {
    const editor = createEditor()
    const failure = new Error('clipboard unavailable')
    const onError = vi.fn()
    const writeText = vi.fn(() => Promise.reject(failure))

    expect(runPlateSelectionToolbarMoreAction(editor, 'copyMarkdown', { onError, writeText })).toBe(
      true,
    )
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure))
  })

  it('does not expose an AI action', () => {
    expect(plateSelectionToolbarMoreActions).not.toContain('ai')
  })

  it('does nothing without an expanded selection', () => {
    const editor = createEditor()
    editor.tf.collapse()

    expect(runPlateSelectionToolbarMoreAction(editor, 'heading1')).toBe(false)
  })
})
