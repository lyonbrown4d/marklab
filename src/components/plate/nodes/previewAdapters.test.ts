import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveMarkdownAsset = vi.hoisted(() => vi.fn())
const toAssetUrl = vi.hoisted(() => vi.fn())
const fetchLinkPreview = vi.hoisted(() => vi.fn())

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    resolveMarkdownAsset,
    toAssetUrl,
  },
}))

vi.mock('@/services/linkPreviewApi', () => ({
  linkPreviewApi: { fetch: fetchLinkPreview },
}))

import {
  embeddedPreviewLinksInElement,
  isMermaidLanguage,
  platePreviewKindForTarget,
  resolvePlateImageSource,
  safeExternalLinkUrl,
  safePreviewUrl,
} from '@/components/plate/nodes/previewAdapters'

describe('Plate preview adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recognizes Mermaid aliases and MarkLab preview file targets', () => {
    expect(isMermaidLanguage(' mermaid ')).toBe(true)
    expect(isMermaidLanguage('MMD')).toBe(true)
    expect(isMermaidLanguage('typescript')).toBe(false)
    expect(platePreviewKindForTarget('diagram.pdf')).toBe('pdf')
    expect(platePreviewKindForTarget('recording.mp3')).toBe('audio')
    expect(platePreviewKindForTarget('clip.mp4')).toBe('video')
  })

  it('collects supported PDF and media links from Plate elements', () => {
    const links = embeddedPreviewLinksInElement({
      children: [
        { children: [{ text: 'Brief' }], type: 'a', url: './brief.pdf' },
        { text: ' and ' },
        { children: [{ text: 'Song' }], type: 'a', url: './song.mp3' },
        { children: [{ text: 'Website' }], type: 'a', url: 'https://example.com' },
      ],
      type: 'p',
    })

    expect(links).toEqual([
      { kind: 'pdf', target: './brief.pdf', title: 'Brief' },
      { kind: 'audio', target: './song.mp3', title: 'Song' },
    ])
  })

  it('allows inert preview URLs and rejects executable schemes', () => {
    expect(safePreviewUrl('https://example.com/a.png')).toBe('')
    expect(safePreviewUrl('marklab-asset://local/v1/token')).toBe('marklab-asset://local/v1/token')
    expect(safePreviewUrl('javascript:alert(1)')).toBe('')
    expect(safePreviewUrl('data:text/html,<script>alert(1)</script>')).toBe('')
  })

  it('resolves a relative Markdown image through the workspace asset boundary', async () => {
    resolveMarkdownAsset.mockResolvedValueOnce({
      absolute_path: 'D:\\vault\\notes\\media\\diagram.png',
      exists: true,
      is_external: false,
      media_type: 'image/png',
      relative_path: 'notes/media/diagram.png',
      source_path: 'notes/current.md',
      target: './media/diagram.png#zoom=2',
    })
    toAssetUrl.mockResolvedValueOnce({
      expires_at_ms: Date.now() + 60_000,
      url: 'marklab-asset://local/v1/image-token',
    })

    await expect(
      resolvePlateImageSource('notes/current.md', './media/diagram.png#zoom=2'),
    ).resolves.toBe('marklab-asset://local/v1/image-token#zoom=2')
    expect(resolveMarkdownAsset).toHaveBeenCalledWith({
      documentPath: 'notes/current.md',
      target: './media/diagram.png#zoom=2',
    })
    expect(toAssetUrl).toHaveBeenCalledWith('notes/media/diagram.png')
    expect(toAssetUrl).not.toHaveBeenCalledWith('./media/diagram.png#zoom=2')
  })

  it('rejects missing, non-image, and executable image sources', async () => {
    resolveMarkdownAsset.mockResolvedValueOnce({
      absolute_path: 'D:\\vault\\notes\\brief.pdf',
      exists: true,
      is_external: false,
      media_type: 'application/pdf',
      relative_path: 'notes/brief.pdf',
      source_path: 'notes/current.md',
      target: './brief.pdf',
    })

    await expect(resolvePlateImageSource('notes/current.md', './brief.pdf')).resolves.toBe('')
    await expect(resolvePlateImageSource('notes/current.md', 'javascript:alert(1)')).resolves.toBe(
      '',
    )
    await expect(resolvePlateImageSource(null, './media/diagram.png')).resolves.toBe('')
    expect(toAssetUrl).not.toHaveBeenCalled()
  })

  it('resolves remote Markdown images through the named preview capability boundary', async () => {
    fetchLinkPreview.mockResolvedValueOnce({
      kind: 'image',
      media_type: 'image/png',
      src: 'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      url: 'https://example.com/image.png',
    })

    await expect(resolvePlateImageSource(null, 'https://example.com/image.png')).resolves.toBe(
      'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    )
    expect(fetchLinkPreview).toHaveBeenCalledWith('https://example.com/image.png')
  })

  it('does not render a remote webpage as a Markdown image', async () => {
    fetchLinkPreview.mockResolvedValueOnce({
      canonical: null,
      description: null,
      favicon: null,
      image: null,
      kind: 'webpage',
      site_name: null,
      title: 'Page',
      url: 'https://example.com/image.png',
    })

    await expect(resolvePlateImageSource(null, 'https://example.com/image.png')).resolves.toBe('')
  })

  it('only exposes safe external HTTP links', () => {
    expect(safeExternalLinkUrl('https://example.com/guide')).toBe('https://example.com/guide')
    expect(safeExternalLinkUrl('http://example.com/guide')).toBe('http://example.com/guide')
    expect(safeExternalLinkUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeExternalLinkUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(safeExternalLinkUrl('//example.com/guide')).toBeUndefined()
  })
})
