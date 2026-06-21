import { describe, expect, it, vi } from 'vitest'
import {
  isMarkdownMediaTarget,
  markdownMediaKindForTarget,
  resolveMarkdownMediaSource,
} from '@/components/milkdown/markdownMediaSource'
import { fsApi } from '@/services/fsApi'

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/runtime/assets', () => ({
  convertAssetFileSrc: (path: string) => `asset://${path}`,
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    resolveMarkdownAsset: vi.fn(),
  },
}))

describe('markdownMediaSource', () => {
  it('classifies audio and video link targets', () => {
    expect(markdownMediaKindForTarget('./voice.mp3')).toBe('audio')
    expect(markdownMediaKindForTarget('./demo.webm#t=1')).toBe('video')
    expect(isMarkdownMediaTarget('./document.pdf')).toBe(false)
  })

  it('keeps external media URLs unchanged', async () => {
    await expect(
      resolveMarkdownMediaSource('notes/doc.md', 'https://site.test/a.mp3'),
    ).resolves.toBe('https://site.test/a.mp3')
    expect(fsApi.resolveMarkdownAsset).not.toHaveBeenCalled()
  })

  it('resolves local media through the workspace asset boundary', async () => {
    vi.mocked(fsApi.resolveMarkdownAsset).mockResolvedValueOnce({
      source_path: 'notes/doc.md',
      target: './media/demo.webm#t=2',
      absolute_path: 'D:/vault/notes/media/demo.webm',
      relative_path: 'notes/media/demo.webm',
      is_external: false,
      media_type: 'video/webm',
      exists: true,
    })

    await expect(resolveMarkdownMediaSource('notes/doc.md', './media/demo.webm#t=2')).resolves.toBe(
      'asset://D:/vault/notes/media/demo.webm#t=2',
    )
  })
})
