import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isCommandPaletteBlockedByActiveSurface,
  useNativeSurfaceOcclusionStore,
} from '@/app/nativeSurfaceOcclusion'
import MarkdownPdfPreview, { PdfPreviewSurface } from '@/components/previews/PdfPreviewSurface'

const documentFile = vi.hoisted(() => vi.fn())
const documentFixture = vi.hoisted(() => ({ numPages: 3 }))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 156,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 8) }, (_, index) => ({
        index,
        key: index,
        size: 156,
        start: index * 156,
      })),
    measureElement: vi.fn(),
  }),
}))

vi.mock('react-pdf', async () => {
  const { useEffect } = await import('react')
  return {
    Document: ({
      children,
      file,
      onLoadSuccess,
    }: {
      children?: React.ReactNode
      file?: unknown
      onLoadSuccess?: (pdf: { numPages: number }) => void
    }) => {
      documentFile(file)
      useEffect(() => {
        onLoadSuccess?.({ numPages: documentFixture.numPages })
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
  beforeEach(() => {
    vi.clearAllMocks()
    documentFixture.numPages = 3
    useNativeSurfaceOcclusionStore.setState({ reasons: {}, commandPaletteBlockers: {} })
  })

  it('registers the expanded PDF viewer as a Search Everywhere blocker', async () => {
    render(
      <MarkdownPdfPreview
        documentPath="D:/notes/readme.md"
        href="brief.pdf"
        resolvePdfSrc={async () => 'marklab-asset://local/v1/brief'}
        title="Brief PDF"
      />,
    )

    await waitFor(() => expect(documentFile).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Expand view' }))

    expect(isCommandPaletteBlockedByActiveSurface()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(isCommandPaletteBlockedByActiveSurface()).toBe(false))
  })

  it('labels the PDF page navigation from i18n', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnect = vi.fn()
        observe = vi.fn()
        unobserve = vi.fn()
      },
    )

    render(
      <PdfPreviewSurface fileUrl="marklab-asset://local/v1/pdf-capability#page=2" mode="inline" />,
    )

    expect(await screen.findByRole('navigation', { name: 'PDF pages' })).toBeInTheDocument()
    expect(documentFile).toHaveBeenCalledWith('marklab-asset://local/v1/pdf-capability')
    expect(screen.getAllByTestId('pdf-document')).toHaveLength(1)
    await waitFor(() => expect(screen.getAllByTestId('pdf-page')).toHaveLength(4))
  })

  it('renders only the first page without thumbnail navigation in graph mode', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnect = vi.fn()
        observe = vi.fn()
        unobserve = vi.fn()
      },
    )

    render(<PdfPreviewSurface fileUrl="marklab-asset://local/v1/pdf-capability" mode="graph" />)

    expect(await screen.findByTestId('pdf-page')).toHaveTextContent('1')
    expect(screen.getAllByTestId('pdf-page')).toHaveLength(1)
    expect(screen.queryByRole('navigation', { name: 'PDF pages' })).not.toBeInTheDocument()
  })

  it('only mounts a bounded thumbnail window for long PDF documents', async () => {
    documentFixture.numPages = 200
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnect = vi.fn()
        observe = vi.fn()
        unobserve = vi.fn()
      },
    )

    render(<PdfPreviewSurface fileUrl="marklab-asset://local/v1/long-pdf" mode="inline" />)

    const navigation = await screen.findByRole('navigation', { name: 'PDF pages' })
    await waitFor(() => expect(navigation.querySelectorAll('button').length).toBeGreaterThan(0))
    expect(navigation.querySelectorAll('button').length).toBeLessThan(20)
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
