import { LRUCache } from 'lru-cache'

type MarkdownPreviewRenderer = (markdown: string) => string

type MarkdownPreviewCacheEntry = {
  html: string
  markdown: string
}

type MarkdownPreviewCacheOptions = {
  maxCharacters?: number
  maxEntries?: number
}

const DEFAULT_MAX_CHARACTERS = 4_000_000
const DEFAULT_MAX_ENTRIES = 128

export const createVirtualizedMarkdownPreviewCache = (
  renderMarkdown: MarkdownPreviewRenderer,
  options: MarkdownPreviewCacheOptions = {},
) => {
  const entries = new LRUCache<object, MarkdownPreviewCacheEntry>({
    max: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxSize: options.maxCharacters ?? DEFAULT_MAX_CHARACTERS,
    sizeCalculation: (entry) => Math.max(1, entry.markdown.length + entry.html.length),
  })

  return {
    render: (segmentIdentity: object, markdown: string) => {
      const cached = entries.get(segmentIdentity)
      if (cached?.markdown === markdown) return cached.html

      const html = renderMarkdown(markdown)
      entries.set(segmentIdentity, { html, markdown })
      return html
    },
  }
}
