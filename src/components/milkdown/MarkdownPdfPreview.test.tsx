import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MarkdownPdfPreview, { PdfPreviewSurface } from '@/components/milkdown/MarkdownPdfPreview'

vi.mock('react-pdf', () => ({
  Document: ({
    children,
    error,
    loading,
  }: {
    children?: React.ReactNode
    error?: React.ReactNode
    loading?: React.ReactNode
  }) => <div data-testid="pdf-document">{loading ?? error ?? children}</div>,
  Page: ({ pageNumber }: { pageNumber?: number }) => <div data-testid="pdf-page">{pageNumber}</div>,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'mock-worker.js',
}))

vi.mock('@/components/milkdown/pdfObjectUrlSource', () => ({
  fetchPdfObjectUrl: vi.fn(async () => 'blob:pdf-preview'),
}))

const messages: Record<string, string> = {
  'preview.pdfExpand': 'Expand view',
  'preview.pdfFailed': 'PDF preview is unavailable',
  'preview.pdfLoading': 'Loading PDF preview...',
  'preview.pdfPages': 'PDF pages',
  'preview.pdfReading': 'Reading PDF...',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

describe('MarkdownPdfPreview', () => {
  it('labels the PDF page navigation from i18n', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnect = vi.fn()
        observe = vi.fn()
        unobserve = vi.fn()
      },
    )

    render(<PdfPreviewSurface fileUrl="file:///docs/example.pdf" mode="inline" />)

    expect(await screen.findByRole('navigation', { name: 'PDF pages' })).toBeInTheDocument()
  })

  it('uses localized PDF loading and failed states', async () => {
    render(
      <MarkdownPdfPreview
        documentPath="D:/notes/readme.md"
        href="missing.pdf"
        resolvePdfSrc={async () => {
          throw new Error('missing pdf')
        }}
        title="Missing PDF"
      />,
    )

    expect(screen.getByRole('button', { name: 'Expand view' })).toBeInTheDocument()
    expect(screen.getByText('Loading PDF preview...')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('PDF preview is unavailable')).toBeInTheDocument()
    })
  })
})
