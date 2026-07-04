import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DocxPreviewSurface from '@/components/previews/DocxPreviewSurface'
import { fetchPreviewAssetBlob } from '@/components/previews/localAssetSource'

vi.mock('docx-preview', () => ({
  renderAsync: vi.fn(),
}))

vi.mock('@/components/previews/localAssetSource', () => ({
  fetchPreviewAssetBlob: vi.fn(),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'preview.docxLabel': `${values?.name ?? 'Document'} preview`,
        'preview.docxLoading': 'Rendering Word document...',
      }
      return labels[key] ?? key
    },
  }),
}))

describe('DocxPreviewSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchPreviewAssetBlob).mockReturnValue(new Promise(() => undefined))
  })

  it('uses the shared loading fallback while rendering the document', () => {
    render(<DocxPreviewSurface src="file:///report.docx" title="report.docx" />)

    const status = screen.getByRole('status', { name: 'Rendering Word document...' })

    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Rendering Word document...')
    expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
  })
})
