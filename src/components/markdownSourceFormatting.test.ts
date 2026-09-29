import { describe, expect, it } from 'vitest'

import {
  applyMarkdownSourceFormat,
  markdownSourceFormatActions,
} from '@/components/markdownSourceFormatting'

const format = (
  action: Parameters<typeof applyMarkdownSourceFormat>[0]['action'],
  text: string,
  selectionStart = 0,
  selectionEnd = text.length,
) => applyMarkdownSourceFormat({ action, selectionEnd, selectionStart, text })

describe('Markdown source formatting', () => {
  it.each([
    ['editor.bold', '**alpha**', '**'],
    ['editor.italic', '_alpha_', '_'],
    ['editor.inlineCode', '`alpha`', '`'],
    ['editor.strike', '~~alpha~~', '~~'],
  ] as const)('toggles %s around the selection', (action, wrapped, marker) => {
    expect(format(action, 'alpha')).toMatchObject({ text: wrapped })
    expect(format(action, wrapped, marker.length, wrapped.length - marker.length)).toMatchObject({
      selectionEnd: 5,
      selectionStart: 0,
      text: 'alpha',
    })
  })

  it('inserts an editable placeholder for an empty inline selection', () => {
    expect(format('editor.bold', '', 0, 0)).toEqual({
      selectionEnd: 6,
      selectionStart: 2,
      text: '**text**',
    })
  })

  it.each([
    ['editor.paragraph', '# Heading\n## Child', 'Heading\nChild'],
    ['editor.heading2', 'Heading\nChild', '## Heading\n## Child'],
    ['editor.quote', 'Alpha\nBeta', '> Alpha\n> Beta'],
    ['editor.bulletList', 'Alpha\nBeta', '- Alpha\n- Beta'],
    ['editor.orderedList', 'Alpha\nBeta', '1. Alpha\n2. Beta'],
  ] as const)('formats whole selected lines with %s', (action, input, expected) => {
    expect(format(action, input)).toMatchObject({ text: expected })
  })

  it('unwraps a fenced code selection and preserves its contents', () => {
    const fenced = '```\nconst value = 1\n```'
    expect(format('editor.codeBlock', fenced)).toMatchObject({ text: 'const value = 1' })
  })

  it('creates a standard GFM table and selects the first header placeholder', () => {
    expect(format('editor.table', '', 0, 0)).toEqual({
      selectionEnd: 8,
      selectionStart: 2,
      text: [
        '| Header 1 | Header 2 | Header 3 |',
        '| --- | --- | --- |',
        '| Cell | Cell | Cell |',
        '| Cell | Cell | Cell |',
      ].join('\n'),
    })
  })

  it('clears common inline and block Markdown formatting', () => {
    expect(format('editor.clearFormat', '## **Hello** ~~world~~')).toMatchObject({
      text: 'Hello world',
    })
  })

  it('exposes every configurable editor command supported by source mode', () => {
    expect(markdownSourceFormatActions).toEqual([
      'editor.paragraph',
      'editor.heading1',
      'editor.heading2',
      'editor.heading3',
      'editor.heading4',
      'editor.heading5',
      'editor.heading6',
      'editor.bold',
      'editor.italic',
      'editor.inlineCode',
      'editor.strike',
      'editor.link',
      'editor.codeBlock',
      'editor.quote',
      'editor.orderedList',
      'editor.bulletList',
      'editor.table',
      'editor.clearFormat',
    ])
  })
})
