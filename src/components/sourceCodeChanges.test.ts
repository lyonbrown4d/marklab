import { describe, expect, it } from 'vitest'
import { toEditorTextChanges } from '@/components/sourceCodeChanges'

describe('source code change adapter', () => {
  it('maps Monaco ranges to sorted buffer offsets', () => {
    expect(
      toEditorTextChanges([
        { rangeOffset: 8, rangeLength: 1, text: 'z' },
        { rangeOffset: 2, rangeLength: 3, text: 'x' },
      ]),
    ).toEqual([
      { offset: 2, delete_length: 3, insert_text: 'x' },
      { offset: 8, delete_length: 1, insert_text: 'z' },
    ])
  })
})
