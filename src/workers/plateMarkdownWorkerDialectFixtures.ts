export type PlateMarkdownWorkerDialectFixture = {
  expectedMarkdown?: string
  expectedNodes?: string[]
  markdown: string
  name: string
}

const lines = (...value: string[]) => value.join('\n')

export const plateMarkdownWorkerDialectFixtures: PlateMarkdownWorkerDialectFixture[] = [
  {
    name: 'combined link, date text, HTML, callout, footnote, math, and GFM',
    markdown: lines(
      'Visit [Marklab](https://marklab.app) on 2026-10-10.',
      '',
      '<details>',
      '<summary>Worker details</summary>',
      '',
      'Press <kbd>Ctrl</kbd><br>to continue.',
      '',
      '</details>',
      '',
      '> [!NOTE]',
      '> Math $x^2$[^math].',
      '',
      '~~done~~',
      '',
      '- [x] shipped',
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '[^math]: Formula note.',
    ),
    expectedNodes: [
      '"type":"a"',
      '"type":"htmlKbd"',
      '"type":"inline_equation"',
      '"type":"footnoteReference"',
      '"type":"table"',
      '"checked":true',
    ],
  },
  {
    name: 'YAML frontmatter',
    markdown: lines('---', 'title: Demo', 'tags:', '  - plate', '---', '', '# Heading'),
    expectedNodes: ['"preservedMarkdownKind":"yaml"', '"type":"h1"'],
  },
  {
    name: 'display and inline math with a footnote',
    markdown: lines(
      'Energy is $E = mc^2$[^proof].',
      '',
      '$$',
      '\\int_0^1 x^2\\,dx',
      '$$',
      '',
      '[^proof]: Formula note.',
    ),
    expectedNodes: ['"type":"inline_equation"', '"type":"equation"', '"type":"footnoteDefinition"'],
  },
  {
    name: 'HTML details, keyboard, and break',
    markdown: lines(
      '<details>',
      '<summary>Worker details</summary>',
      '',
      'Press <kbd>Ctrl</kbd><br>to continue.',
      '',
      '</details>',
    ),
    expectedNodes: ['"type":"htmlDetails"', '"type":"htmlKbd"', '"type":"htmlBr"'],
  },
  {
    name: 'HTML comment',
    markdown: lines('before', '', '<!-- private -->', '', 'after'),
    expectedNodes: ['"htmlCommentSource":"<!-- private -->"'],
  },
  {
    expectedMarkdown: lines('[Docs](./guide.md "Guide")', '', '[guide]: ./guide.md "Guide"'),
    name: 'reference link and definition',
    markdown: lines('[Docs][guide]', '', '[guide]: ./guide.md "Guide"'),
    expectedNodes: ['"type":"a"', '"url":"./guide.md"'],
  },
  {
    expectedMarkdown: lines(
      '![Diagram](./diagram.png "Diagram")',
      '',
      '[diagram]: ./diagram.png "Diagram"',
    ),
    name: 'reference image and definition',
    markdown: lines('![Diagram][diagram]', '', '[diagram]: ./diagram.png "Diagram"'),
    expectedNodes: ['"type":"img"', '"url":"./diagram.png"'],
  },
  {
    name: 'ordered classic list start',
    markdown: lines('3. third', '4. fourth'),
    expectedNodes: ['"start":3', '"type":"ol"'],
  },
  {
    name: 'ordinary classic list',
    markdown: lines('- alpha', '- beta'),
    expectedNodes: ['"type":"ul"', '"type":"li"', '"type":"lic"'],
  },
  {
    name: 'nested classic list with following paragraph',
    markdown: lines('- parent', '', '  - child', '', '  tail'),
    expectedNodes: ['"type":"ul"', '"text":"child"', '"text":"tail"'],
  },
  {
    name: 'heading, code block, and image',
    markdown: lines(
      '# Heading',
      '',
      '```ts',
      'const answer = 42',
      '```',
      '',
      '![diagram](./diagram.png "Diagram")',
    ),
    expectedNodes: ['"type":"h1"', '"type":"code_block"', '"type":"img"'],
  },
  {
    expectedMarkdown: lines('> \\[!NOTE]\\', '> Literal body'),
    name: 'escaped callout literal',
    markdown: lines('> \\[!NOTE]', '> Literal body'),
    expectedNodes: ['"text":"[!NOTE]\\nLiteral body"'],
  },
  {
    name: 'ordered task list',
    markdown: lines('3. [x] done', '4. [ ] pending'),
    expectedNodes: ['"start":3', '"ordered":true', '"checked":true'],
  },
  {
    name: 'complex classic list blocks',
    markdown: lines('- item', '', '  ```ts', '  const value = 1', '  ```', '', '  > quoted'),
    expectedNodes: ['"type":"code_block"', '"type":"blockquote"'],
  },
]
