import { describe, expect, it, vi } from 'vitest'
import { normalizeMarkdownLineBreaks, readCrepeMarkdown } from '@/components/milkdown/editorActions'

describe('normalizeMarkdownLineBreaks', () => {
  it('normalizes html line breaks to newline', () => {
    const markdown = '第一行<br>第二行<br/>第三行<BR />第四行<br   />尾'
    expect(normalizeMarkdownLineBreaks(markdown)).toBe('第一行\n第二行\n第三行\n第四行\n尾')
  })

  it('preserves escaped html break fragments', () => {
    expect(normalizeMarkdownLineBreaks('a<br')).toBe('a<br')
    expect(normalizeMarkdownLineBreaks('a< br')).toBe('a< br')
  })

  it('keeps inline and fenced code blocks untouched', () => {
    expect(normalizeMarkdownLineBreaks('`inline<br>` and `another<br/>`')).toBe(
      '`inline<br>` and `another<br/>`',
    )
    expect(normalizeMarkdownLineBreaks('```\nblock<br/>\n```\n')).toBe('```\nblock<br/>\n```\n')
  })
})

describe('readCrepeMarkdown', () => {
  it('normalizes line breaks from crepe markdown output', () => {
    const crepe = { getMarkdown: vi.fn(() => 'a<br>b\nc<br/>d\n<br >e') }

    expect(readCrepeMarkdown(crepe as never, '')).toBe('a\nb\nc\nd\n\ne')
  })

  it('falls back when crepe is null', () => {
    expect(readCrepeMarkdown(null, 'fallback')).toBe('fallback')
  })
})
