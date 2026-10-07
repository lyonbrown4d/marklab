import { describe, expect, it, vi } from 'vitest'
import { DocumentCompletionIndex } from '@/logic/documentCompletionIndex'
import {
  createDocumentCompletionTokenizer,
  normalizeCompletionSearchKey,
} from '@/logic/documentCompletionTokenizer'

describe('documentCompletionTokenizer', () => {
  const tokenizer = createDocumentCompletionTokenizer()

  it('creates English, Chinese, and mixed-language search anchors', () => {
    const analysis = tokenizer.analyze('Release计划面向AI users')

    expect(analysis.searchKeys).toEqual(
      expect.arrayContaining(['release', '计划', '计划面', '划面', '面向', 'ai', 'users']),
    )
  })

  it('keeps raw UTF-16 offsets while normalizing only search keys', () => {
    const text = '🙂ＡＢＣ café'
    const analysis = tokenizer.analyze(text)
    const fullWidth = analysis.tokens.find(({ text: tokenText }) => tokenText === 'ＡＢＣ')

    expect(fullWidth).toMatchObject({ normalized: 'abc', start: 2, end: 5 })
    expect(text.slice(fullWidth?.start, fullWidth?.end)).toBe('ＡＢＣ')
    expect(normalizeCompletionSearchKey('  ＡbＣ  ')).toBe('abc')
  })

  it('does not split emoji grapheme sequences or supplementary-plane letters', () => {
    const text = '👩🏽‍💻 𠮷野家'
    const analysis = tokenizer.analyze(text)

    expect(analysis.tokens.some((token) => token.text === '👩🏽‍💻')).toBe(true)
    expect(
      analysis.tokens.every((token) => text.slice(token.start, token.end) === token.text),
    ).toBe(true)
    expect(analysis.searchKeys).toContain('𠮷野')
  })

  it('uses sentence segmentation without losing source offsets', () => {
    const text = '第一句。Second sentence!第三句？'

    expect(tokenizer.analyze(text).sentences.map(({ text: sentence }) => sentence)).toEqual([
      '第一句。',
      'Second sentence!',
      '第三句？',
    ])
  })

  it('only analyzes the changed block during batch updates and replacement hydration', () => {
    const delegate = createDocumentCompletionTokenizer()
    const extractionReads = new Set<string>()
    const analyze = vi.fn((text: string) => {
      const analysis = delegate.analyze(text)
      return {
        searchKeys: analysis.searchKeys,
        get sentences() {
          extractionReads.add(text)
          return analysis.sentences
        },
        get tokens() {
          extractionReads.add(text)
          return analysis.tokens
        },
      }
    })
    const index = new DocumentCompletionIndex({ tokenizer: { analyze } })
    const blocks = Array.from({ length: 5_000 }, (_, item) => ({
      id: `block-${item}`,
      text: `Entry ${item} continues with useful text`,
    }))
    index.replaceBlocks(blocks, 1)
    analyze.mockClear()
    extractionReads.clear()
    index.applyBlockBatch(
      [{ type: 'upsert', block: { id: 'block-2500', text: 'Updated block has fresh text' } }],
      2,
    )
    expect(analyze).toHaveBeenCalledTimes(1)
    expect(analyze).toHaveBeenCalledWith('Updated block has fresh text')
    expect([...extractionReads]).toEqual(['Updated block has fresh text'])

    analyze.mockClear()
    extractionReads.clear()
    const hydrated = [...blocks]
    hydrated[2_500] = { id: 'block-2500', text: 'Updated block has fresh text' }
    hydrated[3_000] = { id: 'block-3000', text: 'Another updated block' }
    index.replaceBlocks(hydrated, 3)
    expect(analyze).toHaveBeenCalledTimes(1)
    expect([...extractionReads]).toEqual(['Another updated block'])
  })
})
