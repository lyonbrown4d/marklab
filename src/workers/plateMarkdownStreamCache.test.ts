import type { Value } from 'platejs'
import { describe, expect, it, vi } from 'vitest'
import {
  chunkPlateMarkdownValue,
  PlateMarkdownStreamCache,
} from '@/workers/plateMarkdownStreamCache'

const paragraph = (text: string): Value => [{ type: 'p', children: [{ text }] }]

describe('PlateMarkdownStreamCache', () => {
  it('aligns transport chunks with Plate renderer chunks', () => {
    const value: Value = Array.from({ length: 500 }, (_, index) => ({
      type: 'p',
      children: [{ text: String(index) }],
    }))

    expect(chunkPlateMarkdownValue(value).map((chunk) => chunk.length)).toEqual([20, 240, 240])
  })

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
