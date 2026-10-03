import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { capturePlateSelectionLinkInsertion } from '@/components/plate/selection/plateSelectionLinkInsertion'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import { serializePlateMarkdown } from '@/components/plate/plateMarkdownSerialization'

const createEditor = () => {
  const editor = createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: [{ type: 'p', children: [{ text: 'Guide' }] }],
  })
  editor.tf.select({
    anchor: { offset: 0, path: [0, 0] },
    focus: { offset: 5, path: [0, 0] },
  })
  return editor
}

describe('capturePlateSelectionLinkInsertion', () => {
  it('replaces the captured text with a safe Plate link', () => {
    const editor = createEditor()
    const request = capturePlateSelectionLinkInsertion(editor)

    expect(request?.initialText).toBe('Guide')
    request?.insert({ text: 'Docs', url: './docs.md' })
    expect(serializePlateMarkdown(editor).trim()).toBe('[Docs](./docs.md)')
  })

  it('rejects executable URL schemes', () => {
    const request = capturePlateSelectionLinkInsertion(createEditor())
    expect(() => request?.insert({ text: 'Bad', url: 'javascript:alert(1)' })).toThrow()
  })
})
