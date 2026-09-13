import { describe, expect, it, vi } from 'vitest'
import { importMarkdownImageSources } from '@/components/milkdown/assetEvents'
import { importMarkdownImageSourcesWithPathNotifications } from '@/components/milkdown/documentPathAssetImport'

vi.mock('@/components/milkdown/assetEvents', () => ({
  importMarkdownImageSources: vi.fn(),
}))

describe('document path notification adapter', () => {
  it('supplies the current path on every invalidation and preserves unsubscribe', async () => {
    let path: string | null = 'a.md'
    const listeners = new Set<() => void>()
    const received: Array<string | null> = []
    const unsubscribe = vi.fn(() => listeners.clear())
    vi.mocked(importMarkdownImageSources).mockImplementationOnce(async (_, options) => {
      const release = options.subscribeDocumentPath((next) => received.push(next))
      path = 'b.md'
      listeners.forEach((listener) => listener())
      path = null
      listeners.forEach((listener) => listener())
      path = 'a.md'
      listeners.forEach((listener) => listener())
      release()
      return true
    })

    const insertImage = vi.fn(() => true)
    const result = await importMarkdownImageSourcesWithPathNotifications([], {
      activePath: 'a.md',
      getDocumentPath: () => path,
      getEditorIdentity: () => ({}),
      markdown: '',
      strategy: 'copy-to-document-assets',
      insertImage,
      replaceImageSource: vi.fn(() => true),
      subscribeDocumentPath: (listener) => {
        listeners.add(listener)
        return unsubscribe
      },
    })

    expect(result).toBe(true)
    expect(received).toEqual(['b.md', null, 'a.md'])
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(listeners.size).toBe(0)
    expect(importMarkdownImageSources).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ insertImage }),
    )
  })
})
