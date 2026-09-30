import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '@electron/services/export/markdown.js'

describe('parseMarkdown for rich document export', () => {
  it('preserves GFM deletion as an explicit inline style', () => {
    expect(parseMarkdown('Keep ~~remove~~ this.')).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Keep ' },
          { type: 'deletion', children: [{ type: 'text', text: 'remove' }] },
          { type: 'text', text: ' this.' },
        ],
      },
    ])
  })
})
