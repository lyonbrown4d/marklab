import { describe, expect, it } from 'vitest'
import { normalizePastedUrl } from '@/components/milkdown/pasteEnhancements'

describe('normalizePastedUrl', () => {
  it('accepts http and https URLs as-is', () => {
    expect(normalizePastedUrl('https://example.com/docs')).toBe('https://example.com/docs')
    expect(normalizePastedUrl(' http://example.com ')).toBe('http://example.com')
  })

  it('adds https for www URLs', () => {
    expect(normalizePastedUrl('www.example.com/docs')).toBe('https://www.example.com/docs')
  })

  it('ignores non-url and multi-token paste content', () => {
    expect(normalizePastedUrl('example.com')).toBeNull()
    expect(normalizePastedUrl('https://example.com docs')).toBeNull()
  })
})
