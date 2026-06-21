import { describe, expect, it } from 'vitest'

import { isMarkdownPdfTarget } from '@/components/milkdown/markdownPdfSource'
import { markdownMediaKindForTarget } from '@/components/milkdown/markdownMediaSource'

describe('markdown embed registry wiring', () => {
  it('uses document adapters for pdf targets', () => {
    expect(isMarkdownPdfTarget('brief.PDF#page=2')).toBe(true)
    expect(isMarkdownPdfTarget('diagram.drawio')).toBe(false)
    expect(isMarkdownPdfTarget('sketch.excalidraw')).toBe(false)
    expect(isMarkdownPdfTarget('photo.png')).toBe(false)
  })

  it('uses document adapters for audio and video targets', () => {
    expect(markdownMediaKindForTarget('voice.oga?raw=1')).toBe('audio')
    expect(markdownMediaKindForTarget('movie.m4v#t=2')).toBe('video')
    expect(markdownMediaKindForTarget('brief.pdf')).toBeNull()
    expect(markdownMediaKindForTarget('photo.png')).toBeNull()
  })
})
