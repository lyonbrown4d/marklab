import { deserializeMd, serializeMd } from '@platejs/markdown'
import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import {
  applyPlateAiReplacement,
  capturePlateAiSelection,
} from '@/components/plate/plateAiSelection'

const createEditor = (markdown: string) =>
  createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: (editor) => deserializeMd(editor, markdown),
  })

const selectText = (editor: ReturnType<typeof createEditor>, from: number, to: number) => {
  editor.tf.select({
    anchor: { offset: from, path: [0, 0] },
    focus: { offset: to, path: [0, 0] },
  })
}

describe('Plate AI selection bridge', () => {
  it('replaces the captured selection when the document is unchanged', () => {
    const editor = createEditor('Hello world')
    const root = document.createElement('div')
    selectText(editor, 0, 5)
    const capture = capturePlateAiSelection(editor, 'note.md', root)

    expect(capture?.sourceText).toBe('Hello')
    expect(applyPlateAiReplacement(editor, capture!, 'note.md', 'Hi')).toEqual({ ok: true })
    expect(serializeMd(editor).trim()).toBe('Hi world')
  })

  it('rejects a stale AI replacement after the document changes', () => {
    const editor = createEditor('Hello world')
    const root = document.createElement('div')
    selectText(editor, 0, 5)
    const capture = capturePlateAiSelection(editor, 'note.md', root)
    editor.tf.insertText('Changed')

    expect(applyPlateAiReplacement(editor, capture!, 'note.md', 'Hi')).toEqual({
      ok: false,
      reason: 'document-changed',
    })
  })
})
