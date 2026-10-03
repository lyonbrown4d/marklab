import type { Value } from 'platejs'
import { describe, expect, it, vi } from 'vitest'
import { PlateMarkdownStreamCache } from '@/workers/plateMarkdownStreamCache'

const paragraph = (text: string): Value => [{ type: 'p', children: [{ text }] }]

describe('PlateMarkdownStreamCache', () => {
  it('parses the same Markdown only once while it remains cached', () => {
    const parse = vi.fn((markdown: string) => paragraph(markdown))
    const cache = new PlateMarkdownStreamCache(parse, 1)

    const first = cache.getChunks('First')
    const second = cache.getChunks('First')

    expect(second).toBe(first)
    expect(parse).toHaveBeenCalledOnce()
  })

  it('evicts the least recently used document at the configured limit', () => {
    const parse = vi.fn((markdown: string) => paragraph(markdown))
    const cache = new PlateMarkdownStreamCache(parse, 1)

    cache.getChunks('First')
    cache.getChunks('Second')
    cache.getChunks('First')

    expect(parse).toHaveBeenCalledTimes(3)
  })
})
