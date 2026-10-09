import { serializeMd } from '@platejs/markdown'
import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import { setPlateMarkdownInputRulesComposing } from '@/components/plate/plateMarkdownInputRules'
import { serializePlateMarkdown } from '@/components/plate/plateMarkdownSerialization'

const createEditor = () => {
  const editor = createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: [{ type: 'p', children: [{ text: '' }] }],
  })
  editor.tf.select({ anchor: { offset: 0, path: [0, 0] }, focus: { offset: 0, path: [0, 0] } })
  return editor
}

const createCodeEditor = () => {
  const editor = createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: [
      {
        type: 'code_block',
        children: [{ type: 'code_line', children: [{ text: '' }] }],
      },
    ],
  })
  editor.tf.select({
    anchor: { offset: 0, path: [0, 0, 0] },
    focus: { offset: 0, path: [0, 0, 0] },
  })
  return editor
}

const typeText = (editor: { tf: { insertText: (text: string) => void } }, text: string) => {
  for (const character of text) editor.tf.insertText(character)
}

describe('Plate Markdown input rules', () => {
  it.each([
    ['# ', 'h1'],
    ['## ', 'h2'],
    ['### ', 'h3'],
    ['#### ', 'h4'],
    ['##### ', 'h5'],
    ['###### ', 'h6'],
    ['> ', 'blockquote'],
  ])('recognizes the %s block marker while typing', (input, expectedType) => {
    const editor = createEditor()

    typeText(editor, input)

    expect(editor.children[0]).toMatchObject({ type: expectedType })
    expect(editor.api.string([])).toBe('')
  })

  it.each([
    ['- ', 'ul'],
    ['* ', 'ul'],
    ['+ ', 'ul'],
    ['1. ', 'ol'],
  ])('recognizes the %s list marker while typing', (input, expectedType) => {
    const editor = createEditor()

    typeText(editor, input)

    expect(editor.children[0]).toMatchObject({
      children: [{ children: [{ children: [{ text: '' }], type: 'lic' }], type: 'li' }],
      type: expectedType,
    })
    expect(editor.api.string([])).toBe('')
  })

  it('recognizes a Markdown task marker after a bullet prefix', () => {
    const editor = createEditor()

    typeText(editor, '- [ ] ')

    expect(editor.children[0]).toMatchObject({
      children: [{ checked: false, type: 'li' }],
      type: 'taskList',
    })
    expect(editor.api.string([])).toBe('')
    typeText(editor, 'todo')
    expect(serializeMd(editor).trim()).toBe('- [ ] todo')
  })

  it('recognizes a checked Markdown task marker after a bullet prefix', () => {
    const editor = createEditor()

    typeText(editor, '- [x] done')

    expect(editor.children[0]).toMatchObject({
      children: [{ checked: true, type: 'li' }],
      type: 'taskList',
    })
    expect(serializeMd(editor).trim()).toBe('- [x] done')
  })

  it('recognizes a horizontal rule at the start of a line', () => {
    const editor = createEditor()

    typeText(editor, '---')

    expect(editor.children).toMatchObject([{ type: 'hr' }, { type: 'p', children: [{ text: '' }] }])
    expect(serializePlateMarkdown(editor).trim()).toBe('***')
  })

  it.each([
    ['**bold**', '**bold**'],
    ['*italic*', '*italic*'],
    ['`code`', '`code`'],
    ['~~strike~~', '~~strike~~'],
  ])('recognizes the %s inline marker while typing', (input, expectedMarkdown) => {
    const editor = createEditor()

    typeText(editor, input)

    expect(serializeMd(editor).trim()).toBe(expectedMarkdown)
  })

  it('recognizes inline math while typing', () => {
    const editor = createEditor()

    typeText(editor, '$x^2$')

    expect(editor.children[0]).toMatchObject({
      children: expect.arrayContaining([
        expect.objectContaining({ texExpression: 'x^2', type: 'inline_equation' }),
      ]),
      type: 'p',
    })
  })

  it('recognizes a display-math marker when Enter is pressed', () => {
    const editor = createEditor()
    typeText(editor, '$$')

    editor.tf.insertBreak()

    expect(editor.children[0]).toMatchObject({ texExpression: '', type: 'equation' })
  })

  it('recognizes a complete Markdown link while typing', () => {
    const editor = createEditor()

    typeText(editor, '[MarkLab](https://example.com)')

    expect(editor.children[0]).toMatchObject({ type: 'p' })
    expect(editor.children[0].children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          children: [{ text: 'MarkLab' }],
          type: 'a',
          url: 'https://example.com',
        }),
      ]),
    )
  })

  it.each([
    ['```', undefined],
    ['```mermaid', 'mermaid'],
  ])('recognizes the %s code fence when Enter is pressed', (input, expectedLanguage) => {
    const editor = createEditor()
    typeText(editor, input)

    editor.tf.insertBreak()

    expect(editor.children[0]).toMatchObject({
      children: [{ type: 'code_line', children: [{ text: '' }] }],
      type: 'code_block',
    })
    if (expectedLanguage) expect(editor.children[0]).toMatchObject({ lang: expectedLanguage })
    expect(serializeMd(editor).trim()).toBe(`\`\`\`${expectedLanguage ?? ''}\n\`\`\``)
  })

  it.each(['# ', '> ', '- ', '1. '])(
    'does not transform %s while an IME composition is active',
    (input) => {
      const editor = createEditor()
      setPlateMarkdownInputRulesComposing(editor, true)

      try {
        typeText(editor, input)
      } finally {
        setPlateMarkdownInputRulesComposing(editor, false)
      }

      expect(editor.children[0]).toMatchObject({ type: 'p', children: [{ text: input }] })
    },
  )

  it('does not convert a code fence while an IME composition is active', () => {
    const editor = createEditor()
    setPlateMarkdownInputRulesComposing(editor, true)

    try {
      typeText(editor, '```')
      editor.tf.insertBreak()
    } finally {
      setPlateMarkdownInputRulesComposing(editor, false)
    }

    expect(editor.children).toEqual([
      { type: 'p', children: [{ text: '```' }] },
      { type: 'p', children: [{ text: '' }] },
    ])
  })

  it('keeps math markers literal while an IME composition is active', () => {
    const editor = createEditor()
    setPlateMarkdownInputRulesComposing(editor, true)

    try {
      typeText(editor, '$x$')
      editor.tf.insertBreak()
      typeText(editor, '$$')
      editor.tf.insertBreak()
    } finally {
      setPlateMarkdownInputRulesComposing(editor, false)
    }

    expect(editor.children).toEqual([
      { type: 'p', children: [{ text: '$x$' }] },
      { type: 'p', children: [{ text: '$$' }] },
      { type: 'p', children: [{ text: '' }] },
    ])
  })

  it.each(['# ', '> ', '- ', '1. ', '**bold**', '[link](https://example.com)'])(
    'keeps %s literal inside a fenced code block',
    (input) => {
      const editor = createCodeEditor()

      typeText(editor, input)

      expect(editor.children).toEqual([
        {
          type: 'code_block',
          children: [{ type: 'code_line', children: [{ text: input }] }],
        },
      ])
    },
  )
})
