import { describe, expect, it } from 'vitest'

import { buildNodeOutlineGraph } from '@electron/services/knowledgeEngine/nodeGraph.js'

describe('Node outline graph content blocks', () => {
  it('preserves the structured Markdown blocks owned by each heading', () => {
    const graph = buildNodeOutlineGraph(
      'notes/guide.md',
      [
        '# Guide',
        'Opening paragraph',
        'continues here.',
        '',
        '> Quoted context',
        '>> Nested detail',
        '',
        '```ts',
        'const value = 1',
        '```',
        '',
        '- first',
        '- second',
        '',
        '1. alpha',
        '2. beta',
        '',
        '---',
        '',
        '| Name | Value |',
        '| --- | --- |',
        '| A | B |',
        '',
        '## Next',
        'This belongs to the next heading.',
      ].join('\n'),
    )

    const guide = graph.nodes.find((node) => node.id === 'heading:notes/guide.md:guide')
    const next = graph.nodes.find((node) => node.id === 'heading:notes/guide.md:next')

    expect(guide?.content_blocks).toEqual([
      {
        id: 'heading:notes/guide.md:guide:block:0',
        kind: 'paragraph',
        text: 'Opening paragraph\ncontinues here.',
      },
      {
        id: 'heading:notes/guide.md:guide:block:1',
        kind: 'blockquote',
        level: 2,
        text: 'Quoted context\nNested detail',
      },
      {
        id: 'heading:notes/guide.md:guide:block:2',
        kind: 'code',
        language: 'ts',
        text: 'const value = 1',
      },
      {
        id: 'heading:notes/guide.md:guide:block:3',
        items: ['first', 'second'],
        kind: 'list',
        ordered: false,
      },
      {
        id: 'heading:notes/guide.md:guide:block:4',
        items: ['alpha', 'beta'],
        kind: 'list',
        ordered: true,
      },
      { id: 'heading:notes/guide.md:guide:block:5', kind: 'divider' },
      {
        id: 'heading:notes/guide.md:guide:block:6',
        kind: 'table',
        text: '| Name | Value |\n| --- | --- |\n| A | B |',
      },
    ])
    expect(next?.content_blocks).toEqual([
      {
        id: 'heading:notes/guide.md:next:block:0',
        kind: 'paragraph',
        text: 'This belongs to the next heading.',
      },
    ])
  })
})
