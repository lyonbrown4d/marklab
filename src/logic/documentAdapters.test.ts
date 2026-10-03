import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_ADAPTER_EXTENSIONS,
  documentAdapterForPath,
  fileExtension,
} from '@/logic/documentAdapters'

describe('documentAdapters', () => {
  it('resolves supported non-markdown adapters by extension', () => {
    expect(documentAdapterForPath('assets/photo.WEBP')?.kind).toBe('image')
    expect(documentAdapterForPath('media/theme.flac')?.kind).toBe('audio')
    expect(documentAdapterForPath('media/demo.webm')?.kind).toBe('video')
    expect(documentAdapterForPath('docs/spec.pdf')?.kind).toBe('pdf')
    expect(documentAdapterForPath('docs/spec.docx')?.kind).toBe('docx')
    expect(documentAdapterForPath('diagrams/flow.dio')?.kind).toBe('drawio')
    expect(documentAdapterForPath('src/widget.TSX')?.kind).toBe('source')
    expect(documentAdapterForPath('data/report.csv')?.kind).toBe('source')
    expect(documentAdapterForPath('data/report.tsv')?.kind).toBe('source')
  })

  it('keeps source preview support on a controlled extension allowlist', () => {
    expect(documentAdapterForPath('scripts/build.py')?.kind).toBe('source')
    expect(documentAdapterForPath('scripts/deploy.sh')?.kind).toBe('source')
    expect(documentAdapterForPath('README.md')).toBeNull()
    expect(documentAdapterForPath('payload.exe')).toBeNull()
  })

  it('keeps extension parsing query and hash safe', () => {
    expect(fileExtension('Docs/Spec.PDF#page=2')).toBe('pdf')
    expect(fileExtension('images/photo.large.WEBP?size=full')).toBe('webp')
    expect(fileExtension('README')).toBe('')
  })

  it('exposes a single extension list for workspace document support', () => {
    expect(DOCUMENT_ADAPTER_EXTENSIONS).toContain('pdf')
    expect(DOCUMENT_ADAPTER_EXTENSIONS).toContain('drawio')
    expect(DOCUMENT_ADAPTER_EXTENSIONS).toContain('docx')
    expect(DOCUMENT_ADAPTER_EXTENSIONS).toContain('tsx')
    expect(DOCUMENT_ADAPTER_EXTENSIONS).toContain('csv')
    expect(DOCUMENT_ADAPTER_EXTENSIONS).toContain('tsv')
  })
})
