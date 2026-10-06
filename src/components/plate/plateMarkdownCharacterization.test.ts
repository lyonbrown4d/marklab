import { createPlateEditor } from 'platejs/react'
import { serializeMd } from '@platejs/markdown'
import { describe, expect, it } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import {
  deserializePlateMarkdown,
  serializePlateMarkdown,
} from '@/components/plate/plateMarkdownSerialization'

const createEditor = (markdown: string) =>
  createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: (instance) => deserializePlateMarkdown(instance, markdown),
  })

describe('Plate Markdown compatibility', () => {
  it('round trips the common Markdown structures used by MarkLab', () => {
    const markdown = [
      '# Heading',
      '',
      '**bold** and *italic* with [a link](./note.md) and `code`.',
      '',
      '- [x] completed',
      '- [ ] pending',
      '',
      '| Name | Value |',
      '| --- | ---: |',
      '| alpha | 1 |',
      '',
      '```ts',
      'const answer = 42',
      '```',
      '',
      '![diagram](./diagram.png "Diagram")',
    ].join('\n')
    const editor = createEditor(markdown)

    const serialized = serializeMd(editor)
    const reparsed = createEditor(serialized)

    expect(reparsed.children).toEqual(editor.children)
    expect(serialized).toContain('- [x] completed')
    expect(serialized).toContain('```ts\nconst answer = 42\n```')
    expect(serialized).toContain('![diagram](./diagram.png "Diagram")')
  })

  it('preserves YAML frontmatter as frontmatter instead of document blocks', () => {
    const markdown = ['---', 'title: Demo', 'tags:', '  - plate', '---', '', '# Heading'].join('\n')

    const editor = createEditor(markdown)
    const serialized = serializePlateMarkdown(editor)

    expect(serialized).toContain('---\ntitle: Demo\ntags:\n  - plate\n---')
    expect(serialized).not.toContain('## title: Demo')
  })

  it('normalizes reference links into editable native links without losing metadata', () => {
    const markdown = ['[Docs][guide]', '', '[guide]: ./guide.md "Guide"'].join('\n')
    const editor = createEditor(markdown)

    expect(editor.children[0]).toEqual({
      children: [
        {
          children: [{ text: 'Docs' }],
          title: 'Guide',
          type: 'a',
          url: './guide.md',
        },
      ],
      type: 'p',
    })

    editor.tf.select({
      anchor: { offset: 0, path: [0, 0, 0] },
      focus: { offset: 0, path: [0, 0, 0] },
    })
    editor.tf.insertText('Updated ')

    expect(serializePlateMarkdown(editor).trimEnd()).toBe(
      ['[Updated Docs](./guide.md "Guide")', '', '[guide]: ./guide.md "Guide"'].join('\n'),
    )
  })

  it('preserves inline HTML and normalizes reference images into native images', () => {
    const markdown = [
      'before <kbd>Ctrl</kbd> after',
      '',
      '![Diagram][diagram]',
      '',
      '[diagram]: ./diagram.png "Diagram"',
    ].join('\n')

    const editor = createEditor(markdown)

    expect(editor.children[1]).toMatchObject({
      caption: [{ text: 'Diagram' }],
      title: 'Diagram',
      type: 'img',
      url: './diagram.png',
    })
    expect(serializePlateMarkdown(editor).trimEnd()).toBe(
      [
        'before <kbd>Ctrl</kbd> after',
        '',
        '![Diagram](./diagram.png "Diagram")',
        '',
        '[diagram]: ./diagram.png "Diagram"',
      ].join('\n'),
    )
  })

  it('retains unused definitions and edits made to their visible source', () => {
    const markdown = ['Text', '', '[unused]: /keep "Keep"'].join('\n')
    const editor = createEditor(markdown)
    const definitionText = '[unused]: /keep "Keep"'

    editor.tf.select({
      anchor: { offset: definitionText.length, path: [1, 0] },
      focus: { offset: definitionText.length, path: [1, 0] },
    })
    editor.tf.insertText(' edited')

    expect(serializePlateMarkdown(editor).trimEnd()).toBe(`${markdown} edited`)
  })

  it('retains duplicate definitions while resolving references with Markdown semantics', () => {
    const markdown = ['[Guide][guide]', '', '[guide]: ./first.md', '[guide]: ./second.md'].join(
      '\n',
    )

    expect(serializePlateMarkdown(createEditor(markdown)).trimEnd()).toBe(
      ['[Guide](./first.md)', '', '[guide]: ./first.md', '', '[guide]: ./second.md'].join('\n'),
    )
  })

  it('does not collapse a titled URL link into a title-less autolink', () => {
    const markdown = '[https://example.com](https://example.com "Title")'

    expect(serializePlateMarkdown(createEditor(markdown)).trimEnd()).toBe(markdown)
  })

  it('keeps definitions and following paragraphs inside their list item', () => {
    const markdown = ['- item', '', '  [id]: /url "T"', '', '  tail'].join('\n')

    expect(serializePlateMarkdown(createEditor(markdown)).trimEnd()).toBe(markdown)
  })

  it('keeps a leading definition inside its native list item', () => {
    const markdown = ['- [id]: /url "T"', '', '  body'].join('\n')
    const editor = createEditor(markdown)

    expect(editor.children[0]).toMatchObject({
      children: [
        {
          children: [
            { children: [{ preservedMarkdownKind: 'html' }], type: 'lic' },
            { children: [{ text: 'body' }], type: 'lic' },
          ],
          type: 'li',
        },
      ],
      type: 'ul',
    })
    expect(serializePlateMarkdown(editor).trimEnd()).toBe(markdown)
  })

  it('resolves a list reference without lifting its definition out of the item', () => {
    const markdown = ['- [Link][id]', '', '  [id]: /url "T"'].join('\n')

    expect(serializePlateMarkdown(createEditor(markdown)).trimEnd()).toBe(
      ['- [Link](/url "T")', '', '  [id]: /url "T"'].join('\n'),
    )
  })

  it('keeps ordinary multi-paragraph list items inside their list', () => {
    const markdown = [
      '- first paragraph',
      '',
      '  **bold** [Link][id] ![Diagram](./diagram.png)',
      '',
      '  [id]: /url "T"',
    ].join('\n')
    const editor = createEditor(markdown)
    const list = editor.children[0]

    expect(list).toMatchObject({ type: 'ul' })
    expect(JSON.stringify(list)).toContain('"bold":true')
    expect(JSON.stringify(list)).toContain('"type":"a"')
    expect(JSON.stringify(list)).toContain('"type":"img"')
    expect(serializePlateMarkdown(editor).trimEnd()).toBe(
      [
        '- first paragraph',
        '',
        '  **bold** [Link](/url "T") ![Diagram](./diagram.png)',
        '',
        '  [id]: /url "T"',
      ].join('\n'),
    )
  })

  it('preserves source order when a paragraph follows a nested list', () => {
    const markdown = ['- parent', '', '  - child', '', '  tail'].join('\n')
    const editor = createEditor(markdown)
    const item = (editor.children[0] as { children: unknown[] }).children[0]

    expect(item).toMatchObject({
      children: [
        { type: 'lic' },
        { children: [{ children: [{ type: 'lic' }], type: 'li' }], type: 'ul' },
        { type: 'lic' },
      ],
      type: 'li',
    })
    expect(serializePlateMarkdown(editor).trimEnd()).toBe(markdown)
  })

  it('does not accumulate indentation across repeated complex-list round trips', () => {
    const markdown = ['- item', '', '  ```ts', '  const value = 1', '  ```', '', '  > quoted'].join(
      '\n',
    )
    const once = serializePlateMarkdown(createEditor(markdown)).trimEnd()
    const twice = serializePlateMarkdown(createEditor(once)).trimEnd()

    expect(twice).toBe(once)
  })

  it.each([[['0. zero', '1. one'].join('\n')], [['3. third', '4. fourth'].join('\n')]])(
    'preserves an ordered list start value',
    (markdown) => {
      expect(serializePlateMarkdown(createEditor(markdown)).trimEnd()).toBe(markdown)
    },
  )

  it('preserves ordered task list numbering and checked state', () => {
    const markdown = ['3. [x] done', '4. [ ] pending'].join('\n')
    const editor = createEditor(markdown)

    editor.tf.select({
      anchor: { offset: 4, path: [0, 0, 0, 0] },
      focus: { offset: 4, path: [0, 0, 0, 0] },
    })
    editor.tf.insertText('!')

    expect(editor.children[0]).toMatchObject({
      children: [
        { checked: true, type: 'li' },
        { checked: false, type: 'li' },
      ],
      start: 3,
      type: 'taskList',
    })
    expect(serializePlateMarkdown(editor).trimEnd()).toBe(
      ['3. [x] done!', '4. [ ] pending'].join('\n'),
    )
  })

  it('preserves GitHub-style callout markers in blockquotes', () => {
    const markdown = ['> [!NOTE]', '> Callout body'].join('\n')

    const editor = createEditor(markdown)
    const serialized = serializePlateMarkdown(editor)

    expect(serialized).toContain('> [!NOTE]')
    expect(serialized).not.toContain('> \\[!NOTE]')
  })

  it('keeps an escaped callout-looking literal distinct from a callout marker', () => {
    const markdown = ['> \\[!NOTE]', '> Literal body'].join('\n')
    const editor = createEditor(markdown)

    const serialized = serializePlateMarkdown(editor)

    expect(serialized).toContain('> \\[!NOTE]')
    expect(serialized).not.toContain('> [!NOTE]')
  })
})
