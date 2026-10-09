import { serializeMd } from '@platejs/markdown'
import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import {
  deserializePlateMarkdown,
  serializePlateMarkdown,
} from '@/components/plate/plateMarkdownSerialization'

const createEditor = (markdown: string) =>
  createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: (editor) => deserializePlateMarkdown(editor, markdown),
  })

describe('Plate footnote and math Markdown compatibility', () => {
  it('round trips GFM footnote references and multi-paragraph definitions', () => {
    const markdown = [
      'A statement with a note[^proof].',
      '',
      '[^proof]: First paragraph.',
      '',
      '    Continued detail.',
    ].join('\n')
    const editor = createEditor(markdown)
    const serialized = serializePlateMarkdown(editor).trimEnd()

    expect(editor.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'footnoteDefinition', identifier: 'proof' }),
      ]),
    )
    expect(JSON.stringify(editor.children)).toContain('"type":"footnoteReference"')
    expect(serialized).toBe(markdown)
    expect(createEditor(serialized).children).toEqual(editor.children)
  })

  it('round trips inline and display math without using a private persistence format', () => {
    const markdown = ['Energy is $E = mc^2$.', '', '$$', '\\int_0^1 x^2\\,dx', '$$'].join('\n')
    const editor = createEditor(markdown)
    const serialized = serializeMd(editor).trimEnd()

    expect(JSON.stringify(editor.children)).toContain('"type":"inline_equation"')
    expect(editor.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'equation',
          texExpression: '\\int_0^1 x^2\\,dx',
        }),
      ]),
    )
    expect(serialized).toBe(markdown)
    expect(serialized).not.toContain('mdx')
    expect(createEditor(serialized).children).toEqual(editor.children)
  })

  it('keeps existing Markdown dialects when footnotes and math share a document', () => {
    const markdown = [
      '---',
      'title: Compatibility',
      '---',
      '',
      '<kbd>Ctrl</kbd> and $x^2$[^math]',
      '',
      '> [!NOTE]',
      '> See [Guide][guide].',
      '',
      '3. classic list',
      '',
      '[^math]: Formula note.',
      '',
      '[guide]: ./guide.md "Guide"',
    ].join('\n')
    const serialized = serializePlateMarkdown(createEditor(markdown)).trimEnd()

    expect(serialized).toContain('---\ntitle: Compatibility\n---')
    expect(serialized).toContain('<kbd>Ctrl</kbd>')
    expect(serialized).toContain('> [!NOTE]')
    expect(serialized).toContain('3. classic list')
    expect(serialized).toContain('[Guide](./guide.md "Guide")')
    expect(serialized).toContain('[^math]: Formula note.')
    expect(serialized).toContain('$x^2$[^math]')
  })
})
