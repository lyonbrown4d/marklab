import { describe, expect, it } from 'vitest'
import { analyzeMarkdownText, getMarkdownDocumentStats } from '@/logic/markdownTextAnalysis'

const previousStats = (value: string) => ({
  characters: value.replace(/\s/g, '').length,
  lines: value.length === 0 ? 0 : value.split(/\r\n|\r|\n/).length,
  words: value.trim().length === 0 ? 0 : value.trim().split(/\s+/).filter(Boolean).length,
})

describe('Markdown document stats', () => {
  it.each([
    '',
    ' \t\n\r\n',
    'first\r\nsecond\rthird\nfourth\n',
    'hello 世界 😀 e\u0301',
    '\u00a0one\u1680two\u2003three\u2028four\u2029five\u202fsix\u205fseven\u3000eight\ufeff',
    'zero\u200bwidth\u0085is-not-whitespace',
    'a'.repeat(1_000_000),
    ' \r\n'.repeat(100_000),
  ])('preserves existing UTF-16, whitespace and line-ending counts (%#)', (content) => {
    expect(getMarkdownDocumentStats(content)).toEqual(previousStats(content))
  })

  it('agrees with existing counts across mixed Unicode and newline boundaries', () => {
    const alphabet = ['word', '中', '😀', '\r', '\n', ' ', '\t', '\u2000', '\u2028', '\u200b']
    let seed = 42
    for (let sample = 0; sample < 200; sample += 1) {
      let content = ''
      for (let index = 0; index < 256; index += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        content += alphabet[seed % alphabet.length]
      }
      expect(getMarkdownDocumentStats(content)).toEqual(previousStats(content))
    }
  })

  it('keeps full analysis headings and counts unchanged', () => {
    const content = '# First\n\n## 第二节\n\nText here.'
    const analysis = analyzeMarkdownText(content)
    expect(analysis.stats).toEqual(previousStats(content))
    expect(analysis.outline.map(({ text }) => text)).toEqual(['First', '第二节'])
  })
})
