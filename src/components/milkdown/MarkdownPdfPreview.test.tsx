import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MarkdownPdfPreview, { PdfPreviewSurface } from '@/components/milkdown/MarkdownPdfPreview'

vi.mock('react-pdf', async () => {
  const { useEffect } = await import('react')
  return {
    Document: ({
      children,
      onLoadSuccess,
    }: {
      children?: React.ReactNode
      onLoadSuccess?: (pdf: { numPages: number }) => void
    }) => {
      useEffect(() => {
        onLoadSuccess?.({ numPages: 3 })
      }, [onLoadSuccess])
      return <div data-testid="pdf-document">{children}</div>
    },
    Page: ({ pageNumber }: { pageNumber?: number }) => (
      <div data-testid="pdf-page">{pageNumber}</div>
    ),
    pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
  }
})

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'mock-worker.js',
}))

vi.mock('@/components/milkdown/pdfDocumentSource', () => ({
  fetchPdfDocumentData: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
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
    expect(screen.getAllByTestId('pdf-document')).toHaveLength(1)
    await waitFor(() => expect(screen.getAllByTestId('pdf-page')).toHaveLength(4))
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
    expect(screen.getByText('PDF')).toHaveClass('bg-secondary', 'text-secondary-foreground')
    const status = screen.getByRole('status', { name: 'Loading PDF preview...' })
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Loading PDF preview...')
    expect(screen.getAllByRole('status')).toHaveLength(1)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('PDF preview is unavailable')
    expect(alert).toHaveClass('bg-destructive/10')
  })
})
