import { describe, expect, it, vi } from 'vitest'

const getPathMetadata = vi.hoisted(() => vi.fn())
const resolveMarkdownAsset = vi.hoisted(() => vi.fn())

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/runtime/assets', () => ({
  convertAssetFileSrc: (path: string) => `asset://${path.replace(/\\/g, '/')}`,
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    getPathMetadata,
    resolveMarkdownAsset,
  },
}))

import {
  embeddedPreviewKindForTarget,
  resolveEmbeddedPreviewTarget,
} from '@/components/previews/embeddedPreviewSource'

describe('embeddedPreviewSource', () => {
  it('classifies document targets that can be rendered as embedded cards', () => {
    expect(embeddedPreviewKindForTarget('brief.docx')).toBe('docx')
    expect(embeddedPreviewKindForTarget('diagram.drawio')).toBe('drawio')
    expect(embeddedPreviewKindForTarget('sketch.excalidraw')).toBe('excalidraw')
    expect(embeddedPreviewKindForTarget('deck.pptx')).toBeNull()
  })

  it('resolves markdown relative document targets through the asset boundary', async () => {
    resolveMarkdownAsset.mockResolvedValueOnce({
      absolute_path: 'D:\\vault\\docs\\brief.docx',
      exists: true,
      is_external: false,
      media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      relative_path: 'docs/brief.docx',
      source_path: 'notes/current.md',
      target: '../docs/brief.docx',
    })

    await expect(
      resolveEmbeddedPreviewTarget('notes/current.md', '../docs/brief.docx'),
    ).resolves.toEqual({
      external: false,
      kind: 'docx',
      path: 'docs/brief.docx',
      readonly: false,
      src: 'asset://D:/vault/docs/brief.docx',
    })
  })

  it('resolves workspace preview paths when no markdown document context exists', async () => {
    getPathMetadata.mockResolvedValueOnce({
      absolute_path: 'D:\\vault\\docs\\brief.pdf',
      kind: 'file',
      modified_ms: 1,
      path: 'docs/brief.pdf',
      readonly: true,
      size_bytes: 100,
    })

    await expect(resolveEmbeddedPreviewTarget(null, 'docs/brief.pdf#page=2')).resolves.toEqual({
      external: false,
      kind: 'pdf',
      path: 'docs/brief.pdf',
      readonly: true,
      src: 'asset://D:/vault/docs/brief.pdf#page=2',
    })
  })

  it('keeps external preview targets loadable without filesystem resolution', async () => {
    await expect(
      resolveEmbeddedPreviewTarget('notes/current.md', 'https://site.test/brief.pdf'),
    ).resolves.toEqual({
      external: true,
      kind: 'pdf',
      path: null,
      readonly: true,
      src: 'https://site.test/brief.pdf',
    })
    expect(resolveMarkdownAsset).not.toHaveBeenCalledWith({
      documentPath: 'notes/current.md',
      target: 'https://site.test/brief.pdf',
    })
  })
})
