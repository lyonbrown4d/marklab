import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isMarkdownMediaTarget,
  markdownMediaKindForTarget,
  resolveMarkdownMediaSource,
} from '@/components/milkdown/markdownMediaSource'
import { fsApi } from '@/services/fsApi'

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    resolveMarkdownAsset: vi.fn(),
    toAssetUrl: vi.fn(),
  },
}))

beforeEach(() => vi.clearAllMocks())

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
      relative_path: 'notes/media/demo.webm',
      is_external: false,
      media_type: 'video/webm',
      exists: true,
    })
    vi.mocked(fsApi.toAssetUrl).mockResolvedValueOnce({
      url: 'marklab-asset://local/v1/test-capability',
      expires_at_ms: Date.now() + 60_000,
    })

    await expect(resolveMarkdownMediaSource('notes/doc.md', './media/demo.webm#t=2')).resolves.toBe(
      'marklab-asset://local/v1/test-capability#t=2',
    )
    expect(fsApi.toAssetUrl).toHaveBeenCalledWith('notes/media/demo.webm')
  })
})
