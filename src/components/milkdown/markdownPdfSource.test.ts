import { describe, expect, it, vi } from 'vitest'

const resolveMarkdownAsset = vi.hoisted(() => vi.fn())

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    resolveMarkdownAsset,
  },
}))

vi.mock('@/runtime/assets', () => ({
  convertAssetFileSrc: (path: string) => `asset://${path.replace(/\\/g, '/')}`,
}))

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

import {
  isMarkdownPdfTarget,
  resolveMarkdownPdfSource,
} from '@/components/milkdown/markdownPdfSource'

describe('markdown PDF source helpers', () => {
  it('detects PDF link targets with query or hash suffixes', () => {
    expect(isMarkdownPdfTarget('./docs/spec.pdf')).toBe(true)
    expect(isMarkdownPdfTarget('./docs/spec.pdf#page=2')).toBe(true)
    expect(isMarkdownPdfTarget('./docs/spec.png')).toBe(false)
  })

  it('resolves local PDF links through the desktop asset bridge', async () => {
    resolveMarkdownAsset.mockResolvedValueOnce({
      absolute_path: 'D:\\docs\\spec.pdf',
      exists: true,
      is_external: false,
      media_type: 'application/pdf',
    })

    await expect(resolveMarkdownPdfSource('notes/current.md', './spec.pdf#page=2')).resolves.toBe(
      'asset://D:/docs/spec.pdf#page=2',
    )
    expect(resolveMarkdownAsset).toHaveBeenCalledWith({
      documentPath: 'notes/current.md',
      target: './spec.pdf#page=2',
    })
  })
})
