import { LRUCache } from 'lru-cache'

type MarkdownDocumentParser<TDocument> = (markdown: string) => Promise<TDocument>

type MarkdownDocumentCacheEntry<TDocument> = {
  document: Promise<TDocument>
  markdown: string
}

type MarkdownDocumentCacheOptions = {
  maxCharacters?: number
  maxEntries?: number
}

const DEFAULT_MAX_CHARACTERS = 4_000_000
const DEFAULT_MAX_ENTRIES = 128

export const createVirtualizedMarkdownReadonlyCache = <TDocument>(
  parseMarkdown: MarkdownDocumentParser<TDocument>,
  options: MarkdownDocumentCacheOptions = {},
) => {
  const entries = new LRUCache<object, MarkdownDocumentCacheEntry<TDocument>>({
    max: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxSize: options.maxCharacters ?? DEFAULT_MAX_CHARACTERS,
    sizeCalculation: (entry) => Math.max(1, entry.markdown.length),
  })

  return {
    parse: (segmentIdentity: object, markdown: string) => {
      const cached = entries.get(segmentIdentity)
      if (cached?.markdown === markdown) return cached.document

      const entry: MarkdownDocumentCacheEntry<TDocument> = {
        document: parseMarkdown(markdown),
        markdown,
      }
      entries.set(segmentIdentity, entry)
      void entry.document.catch(() => {
        if (entries.peek(segmentIdentity) === entry) entries.delete(segmentIdentity)
      })
      return entry.document
    },
  }
}
