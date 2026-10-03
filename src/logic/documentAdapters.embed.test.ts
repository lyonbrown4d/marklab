import { describe, expect, it } from 'vitest'

import {
  documentAdapterExtensionsForKind,
  documentAdapterForMarkdownEmbedPath,
  documentAdapterMarkdownEmbedKind,
  documentAdapterMarkdownEmbedKindForPath,
  documentAdapterForPath,
} from '@/logic/documentAdapters'

describe('document adapter markdown embed helpers', () => {
  it('maps markdown embeddable assets through the registry', () => {
    expect(documentAdapterForMarkdownEmbedPath('photo.ICO')?.kind).toBe('image')
    expect(documentAdapterForMarkdownEmbedPath('clip.webm#t=2')?.kind).toBe('video')
    expect(documentAdapterForMarkdownEmbedPath('voice.oga?raw=1')?.kind).toBe('audio')
    expect(documentAdapterForMarkdownEmbedPath('brief.pdf#page=2')?.kind).toBe('pdf')
  })

  it('supports document adapters as markdown embedded document cards', () => {
    expect(documentAdapterForMarkdownEmbedPath('notes.docx')?.kind).toBe('docx')
    expect(documentAdapterForMarkdownEmbedPath('flow.drawio')?.kind).toBe('drawio')
    expect(documentAdapterForMarkdownEmbedPath('sketch.excalidraw')?.kind).toBe('excalidraw')
    expect(documentAdapterForMarkdownEmbedPath('src/example.ts')?.kind).toBe('source')
    expect(documentAdapterForMarkdownEmbedPath('data/example.csv')?.kind).toBe('source')
  })

  it('exposes adapter-specific extensions for picker filters', () => {
    expect(documentAdapterExtensionsForKind('image')).toContain('ico')
    expect(documentAdapterExtensionsForKind('excalidraw')).toEqual(['excalidraw'])
    expect(documentAdapterExtensionsForKind('source')).toEqual(
      expect.arrayContaining(['csv', 'tsv', 'js', 'ts']),
    )
  })

  it('returns semantic markdown embed kinds', () => {
    expect(documentAdapterMarkdownEmbedKindForPath('photo.png')).toBe('image')
    expect(documentAdapterMarkdownEmbedKindForPath('brief.pdf')).toBe('pdf')
    expect(documentAdapterMarkdownEmbedKindForPath('clip.mp4')).toBe('media')
    expect(documentAdapterMarkdownEmbedKind(documentAdapterForPath('flow.drawio'))).toBe('document')
    expect(documentAdapterMarkdownEmbedKindForPath('src/example.rs')).toBe('document')
  })
})
