import { describe, expect, it, vi } from 'vitest'
import { createVirtualizedMarkdownReadonlyCache } from '@/components/virtualizedMarkdownReadonlyCache'

describe('createVirtualizedMarkdownReadonlyCache', () => {
  it('reuses a parsed document while a segment identity and source stay unchanged', async () => {
    const parse = vi.fn(async (markdown: string) => ({ markdown }))
    const cache = createVirtualizedMarkdownReadonlyCache(parse)
    const segment = {}

    const first = cache.parse(segment, 'Cached')
    const second = cache.parse(segment, 'Cached')

    expect(first).toBe(second)
    await expect(first).resolves.toEqual({ markdown: 'Cached' })
    expect(parse).toHaveBeenCalledOnce()
  })

  it('invalidates a cached document when its Markdown changes', async () => {
    const parse = vi.fn(async (markdown: string) => ({ markdown }))
    const cache = createVirtualizedMarkdownReadonlyCache(parse)
    const segment = {}

    await cache.parse(segment, 'Before')
    await expect(cache.parse(segment, 'After')).resolves.toEqual({ markdown: 'After' })
    expect(parse).toHaveBeenCalledTimes(2)
  })

  it('evicts least-recently-used documents when the configured limit is reached', async () => {
    const parse = vi.fn(async (markdown: string) => ({ markdown }))
    const cache = createVirtualizedMarkdownReadonlyCache(parse, { maxEntries: 2 })
    const first = {}

    await cache.parse(first, 'First')
    await cache.parse({}, 'Second')
    await cache.parse({}, 'Third')
    await cache.parse(first, 'First')

    expect(parse).toHaveBeenCalledTimes(4)
  })

  it('does not retain failed parsing work', async () => {
    const parse = vi
      .fn<(markdown: string) => Promise<{ markdown: string }>>()
      .mockRejectedValueOnce(new Error('parse failed'))
      .mockImplementationOnce(async (markdown) => ({ markdown }))
    const cache = createVirtualizedMarkdownReadonlyCache(parse)
    const segment = {}

    await expect(cache.parse(segment, 'Retry')).rejects.toThrow('parse failed')
    await expect(cache.parse(segment, 'Retry')).resolves.toEqual({ markdown: 'Retry' })
    expect(parse).toHaveBeenCalledTimes(2)
  })
})
