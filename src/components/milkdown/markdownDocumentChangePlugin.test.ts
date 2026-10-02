import { describe, expect, it, vi } from 'vitest'
import { createMarkdownDocumentChangeView } from '@/components/milkdown/markdownDocumentChangePlugin'

const createDocument = (id: string) => ({
  eq: (other: { id: string }) => id === other.id,
  id,
})

describe('markdownDocumentChangePlugin', () => {
  it('reports document changes directly from the ProseMirror view', () => {
    const onDocumentChange = vi.fn()
    const previousState = { doc: createDocument('before') }
    const document = createDocument('after')
    const pluginView = createMarkdownDocumentChangeView(onDocumentChange)

    pluginView.update({ state: { doc: document } } as never, previousState as never)

    expect(onDocumentChange).toHaveBeenCalledWith(document)
  })

  it('ignores selection-only updates', () => {
    const onDocumentChange = vi.fn()
    const document = createDocument('same')
    const pluginView = createMarkdownDocumentChangeView(onDocumentChange)

    pluginView.update({ state: { doc: document } } as never, { doc: document } as never)

    expect(onDocumentChange).not.toHaveBeenCalled()
  })
})
