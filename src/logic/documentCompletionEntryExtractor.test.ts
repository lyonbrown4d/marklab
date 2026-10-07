import { describe, expect, it } from 'vitest'
import {
  exactCompletionContinuation,
  extractCompletionBlock,
} from '@/logic/documentCompletionEntryExtractor'
import { createDocumentCompletionTokenizer } from '@/logic/documentCompletionTokenizer'

describe('documentCompletionEntryExtractor', () => {
  it('maps a composed query through a decomposed grapheme to the original UTF-16 end', () => {
    expect(exactCompletionContinuation('Cafe\u0301 noir', 'CAFÉ')).toEqual({
      exactRank: 0,
      text: ' noir',
    })
  })

  it('counts both CRLF code units in entry positions', () => {
    const text = 'First sentence.\r\nSecond sentence.'
    const analysis = createDocumentCompletionTokenizer().analyze(text)
    const extracted = extractCompletionBlock(text, analysis, { fenced: false, section: null })

    expect(extracted.entries.find((entry) => entry.text === 'Second sentence.')?.position).toBe(17)
  })
})
