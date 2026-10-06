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

describe('Plate Markdown HTML compatibility', () => {
  it('keeps marker comments invisible while preserving their source', () => {
    const markdown = [
      '<!-- iteration-status-2026-08-93:start -->',
      '',
      '## Iteration status',
      '',
      'Ready for review.',
      '',
      '<!-- iteration-status-2026-08-93:end -->',
    ].join('\n')
    const editor = createEditor(markdown)
    const visibleText = editor.children.map((node) => editor.api.string(node)).join('\n')

    expect(visibleText).toContain('Iteration status')
    expect(visibleText).not.toContain('iteration-status-2026-08-93')
    expect(serializePlateMarkdown(editor).trimEnd()).toBe(markdown)
  })

  it('converts details and summary HTML to editable semantic Plate blocks', () => {
    const markdown = [
      '<details open>',
      '<summary>More <strong>context</strong></summary>',
      '',
      'Hidden **content**.',
      '',
      '</details>',
    ].join('\n')
    const editor = createEditor(markdown)

    expect(editor.children[0]).toMatchObject({
      open: true,
      type: 'htmlDetails',
      children: [
        {
          type: 'htmlSummary',
          children: [{ text: 'More ' }, { bold: true, text: 'context' }],
        },
        { type: 'p' },
      ],
    })
    expect(serializePlateMarkdown(editor).trimEnd()).toBe(markdown)

    editor.tf.select({
      anchor: { offset: 7, path: [0, 0, 1] },
      focus: { offset: 7, path: [0, 0, 1] },
    })
    editor.tf.insertText('!')
    expect(serializePlateMarkdown(editor)).toContain(
      '<summary>More <strong>context!</strong></summary>',
    )
  })

  it('converts safe inline kbd and br HTML to Plate nodes', () => {
    const markdown = 'Press <kbd>Ctrl</kbd><br>then continue.'
    const editor = createEditor(markdown)

    expect(editor.children[0]).toMatchObject({
      type: 'p',
      children: [
        { text: 'Press ' },
        { children: [{ text: 'Ctrl' }], type: 'htmlKbd' },
        { children: [{ text: '' }], type: 'htmlBr' },
        { text: 'then continue.' },
      ],
    })
    expect(serializePlateMarkdown(editor).trimEnd()).toBe(markdown)
  })

  it('never promotes unsafe HTML into executable Plate nodes', () => {
    const markdown = [
      '<details onclick="globalThis.pwned = true">',
      '<summary><script>globalThis.pwned = true</script>Safe</summary>',
      '',
      '<img src=x onerror="globalThis.pwned = true">',
      '',
      '</details>',
    ].join('\n')
    const editor = createEditor(markdown)
    const serializedValue = JSON.stringify(editor.children)

    expect(serializedValue).not.toContain('onclick')
    expect(serializedValue).not.toContain('onerror')
    expect(serializedValue).not.toContain('globalThis.pwned')
    expect(editor.api.string(editor.children[0])).toContain('Safe')
    const serialized = serializePlateMarkdown(editor)
    expect(serialized).toContain('<summary>Safe</summary>')
    expect(serialized).toContain('![](x)')
    expect(serialized).not.toContain('globalThis.pwned')
  })

  it('keeps unsupported HTML as visible source instead of dropping it', () => {
    const markdown = '<custom-widget data-id="42">payload</custom-widget>'
    const editor = createEditor(markdown)

    expect(editor.api.string(editor.children[0])).toContain(markdown)
    expect(serializePlateMarkdown(editor).trimEnd()).toBe(markdown)
  })

  it('preserves a mixed HTML block instead of consuming only its first image', () => {
    const markdown = ['<img src="safe.png">', '<div>keep me</div>'].join('\n')
    const editor = createEditor(markdown)

    expect(editor.api.string(editor.children[0])).toContain('keep me')
    expect(serializePlateMarkdown(editor).trimEnd()).toBe(markdown)
  })
})
