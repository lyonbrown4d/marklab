import { describe, expect, it, vi } from 'vitest'
import { createVirtualizedMarkdownPreviewCache } from '@/components/virtualizedMarkdownPreviewCache'

describe('createVirtualizedMarkdownPreviewCache', () => {
  it('reuses rendered HTML while a segment identity and source stay unchanged', () => {
    const render = vi.fn((markdown: string) => `<p>${markdown}</p>`)
    const cache = createVirtualizedMarkdownPreviewCache(render)
    const segment = {}

    expect(cache.render(segment, 'Cached')).toBe('<p>Cached</p>')
    expect(cache.render(segment, 'Cached')).toBe('<p>Cached</p>')
    expect(render).toHaveBeenCalledOnce()
  })

  it('invalidates a cached segment when its Markdown changes', () => {
    const render = vi.fn((markdown: string) => `<p>${markdown}</p>`)
    const cache = createVirtualizedMarkdownPreviewCache(render)
    const segment = {}

    cache.render(segment, 'Before')

    expect(cache.render(segment, 'After')).toBe('<p>After</p>')
    expect(render).toHaveBeenCalledTimes(2)
  })

  it('evicts least-recently-used segments when the configured limit is reached', () => {
    const render = vi.fn((markdown: string) => `<p>${markdown}</p>`)
    const cache = createVirtualizedMarkdownPreviewCache(render, { maxEntries: 2 })
    const first = {}

    cache.render(first, 'First')
    cache.render({}, 'Second')
    cache.render({}, 'Third')
    cache.render(first, 'First')

    expect(render).toHaveBeenCalledTimes(4)
  })
})
