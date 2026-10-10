import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { deserializePlateMarkdown } from '@/components/plate/plateMarkdownSerialization'
import { plateMarkdownPlugins } from '@/components/plate/plateMarkdownConfig'
import {
  serializePlateBlockClipboard,
  serializeDomSelectionHtml,
  serializePlateSelectionClipboard,
  serializePlateSelectionMarkdown,
} from '@/components/plate/plateClipboardSerialization'

const createEditor = (markdown: string) =>
  createPlateEditor({
    plugins: [...plateMarkdownPlugins],
    value: (editor) => deserializePlateMarkdown(editor, markdown),
  })

describe('Plate clipboard serialization', () => {
  it('serializes only the selected rich text as Markdown', () => {
    const editor = createEditor('Before **bold** after')
    editor.tf.select({
      anchor: { path: [0, 1], offset: 0 },
      focus: { path: [0, 1], offset: 4 },
    })

    expect(serializePlateSelectionMarkdown(editor)).toBe('**bold**')
    expect(serializePlateSelectionClipboard(editor, null)).toEqual({
      html: undefined,
      markdown: '**bold**',
      text: 'bold',
    })
  })

  it('preserves a selected code block as fenced Markdown', () => {
    const editor = createEditor('```ts\nconst value = 1\n```')
    editor.tf.select({
      anchor: { path: [0, 0, 0], offset: 0 },
      focus: { path: [0, 0, 0], offset: 15 },
    })

    expect(serializePlateSelectionMarkdown(editor)).toBe('```ts\nconst value = 1\n```')
  })

  it('serializes a whole block independently from the text selection', () => {
    const editor = createEditor('## Heading')
    const element = editor.children[0]
    const domNode = document.createElement('h2')
    domNode.textContent = 'Heading'
    editor.api.toDOMNode = () => domNode

    expect(serializePlateBlockClipboard(editor, element)).toEqual({
      html: '<h2>Heading</h2>',
      markdown: '## Heading',
      text: 'Heading',
    })
  })

  it('returns null for an empty selection', () => {
    const editor = createEditor('Text')
    editor.tf.select({ path: [0, 0], offset: 2 })

    expect(serializePlateSelectionMarkdown(editor)).toBeNull()
  })

  it('clones selected DOM content as HTML', () => {
    const root = document.createElement('div')
    root.className = 'markdown-editor'
    root.innerHTML = '<p>Before <strong>bold</strong> after</p>'
    document.body.append(root)
    const range = document.createRange()
    range.selectNode(root.querySelector('strong')!)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(serializeDomSelectionHtml(selection)).toBe('<strong>bold</strong>')
    selection.removeAllRanges()
    root.remove()
  })

  it('keeps inline semantics for a partial DOM selection', () => {
    const root = document.createElement('div')
    root.className = 'markdown-editor'
    root.innerHTML = '<p>Before <strong>bold text</strong> after</p>'
    document.body.append(root)
    const text = root.querySelector('strong')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 4)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(serializeDomSelectionHtml(selection)).toBe('<strong>bold</strong>')
    selection.removeAllRanges()
    root.remove()
  })
})
