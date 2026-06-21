import { describe, expect, it } from 'vitest'
import {
  fileExtension,
  fileViewForOpenPath,
  getPreviewFileKind,
  isDocxFilePath,
  isDrawioFilePath,
  isImageFilePath,
  isMarkdownFilePath,
  isPdfFilePath,
  isAudioFilePath,
  isVideoFilePath,
  isTextFileViewPath,
} from '@/logic/fileTypes'

describe('fileTypes', () => {
  it('normalizes extensions before classifying files', () => {
    expect(fileExtension('Docs/Spec.PDF#page=2')).toBe('pdf')
    expect(fileExtension('images/photo.large.WEBP?size=full')).toBe('webp')
    expect(fileExtension('README')).toBe('')
  })

  it('classifies markdown, pdf, and browser-previewable images', () => {
    expect(isMarkdownFilePath('notes/today.md')).toBe(true)
    expect(isDocxFilePath('docs/spec.docx')).toBe(true)
    expect(isDrawioFilePath('diagrams/flow.drawio')).toBe(true)
    expect(isDrawioFilePath('diagrams/flow.dio')).toBe(true)
    expect(isPdfFilePath('docs/spec.pdf')).toBe(true)
    expect(isImageFilePath('assets/diagram.svg')).toBe(true)
    expect(isAudioFilePath('media/theme.flac')).toBe(true)
    expect(isVideoFilePath('media/demo.webm')).toBe(true)
    expect(getPreviewFileKind('docs/spec.docx')).toBe('docx')
    expect(getPreviewFileKind('diagrams/flow.drawio')).toBe('drawio')
    expect(getPreviewFileKind('assets/diagram.svg')).toBe('image')
    expect(getPreviewFileKind('docs/spec.pdf')).toBe('pdf')
    expect(getPreviewFileKind('media/theme.flac')).toBe('audio')
    expect(getPreviewFileKind('media/demo.webm')).toBe('video')
  })

  it('opens pdf and images in preview tabs while keeping text files in the preferred view', () => {
    expect(fileViewForOpenPath('docs/spec.docx', 'source')).toBe('preview')
    expect(fileViewForOpenPath('diagrams/flow.drawio', 'source')).toBe('preview')
    expect(fileViewForOpenPath('docs/spec.pdf', 'source')).toBe('preview')
    expect(fileViewForOpenPath('assets/cover.png', 'graph')).toBe('preview')
    expect(fileViewForOpenPath('media/theme.mp3', 'source')).toBe('preview')
    expect(fileViewForOpenPath('media/demo.mp4', 'graph')).toBe('preview')
    expect(fileViewForOpenPath('notes/today.md', 'source')).toBe('source')
    expect(fileViewForOpenPath('notes/today.md', 'preview')).toBe('edit')
    expect(isTextFileViewPath('docs/spec.pdf')).toBe(false)
    expect(isTextFileViewPath('notes/today.md')).toBe(true)
  })
})
