import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EmbeddedFilePreview from '@/components/previews/EmbeddedFilePreview'

const resolveEmbeddedPreviewTarget = vi.hoisted(() => vi.fn())

vi.mock('@/components/previews/embeddedPreviewSource', () => ({
  embeddedPreviewKindForTarget: () => 'pdf',
  resolveEmbeddedPreviewTarget,
}))

vi.mock('@/components/previews/FilePreviewSurface', () => ({
  default: ({ presentation }: { presentation?: string }) => (
    <div data-presentation={presentation} data-testid="file-preview-surface" />
  ),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.path ? `${key}:${options.path}` : key,
  }),
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    openPathInSystem: vi.fn(),
  },
}))

const resolvedPdf = {
  external: false,
  kind: 'pdf',
  path: 'docs/brief.pdf',
  readonly: false,
  src: 'asset://docs/brief.pdf',
}

const renderPreview = ({
  onPointerDown,
  onWheel,
  variant,
}: {
  onPointerDown?: () => void
  onWheel?: () => void
  variant?: 'document' | 'graph'
} = {}) =>
  render(
    <div onPointerDown={onPointerDown} onWheel={onWheel}>
      <EmbeddedFilePreview
        documentPath="notes/current.md"
        target="./brief.pdf"
        title="Brief"
        variant={variant}
      />
    </div>,
  )

describe('EmbeddedFilePreview interactions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('uses the bounded graph presentation until expanded', async () => {
    resolveEmbeddedPreviewTarget.mockResolvedValue(resolvedPdf)

    const { container } = renderPreview({ variant: 'graph' })

    expect(await screen.findByText('preview.inlineReady:docs/brief.pdf')).toBeInTheDocument()
    expect(container.querySelector('[data-preview-variant="graph"]')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="embedded-preview-header"]')).toHaveClass(
      'embedded-preview-drag-handle',
    )
    expect(screen.queryByTestId('file-preview-surface')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'preview.graphPdfLoad' }))
    expect(await screen.findByTestId('file-preview-surface')).toHaveAttribute(
      'data-presentation',
      'graph',
    )

    fireEvent.click(screen.getByRole('button', { name: /preview\.openEmbedded/ }))

    expect(await screen.findByTestId('file-preview-surface')).toHaveAttribute(
      'data-presentation',
      'full',
    )
  })

  it('keeps pointer interaction inside the preview widget boundary', () => {
    const parentPointerDown = vi.fn()

    renderPreview({ onPointerDown: parentPointerDown })

    const card = screen
      .getByText('Brief')
      .closest<HTMLElement>('[data-marklab-editor-chrome="embedded-preview"]')
    if (!card) throw new Error('Expected embedded preview card')

    fireEvent.pointerDown(card)

    expect(parentPointerDown).not.toHaveBeenCalled()
  })

  it('lets graph drag-handle pointer events reach the canvas while containing body events', async () => {
    const parentPointerDown = vi.fn()
    resolveEmbeddedPreviewTarget.mockResolvedValue(resolvedPdf)

    renderPreview({ onPointerDown: parentPointerDown, variant: 'graph' })

    const header = await screen.findByText('Brief')
    fireEvent.pointerDown(header.closest('header')!)
    expect(parentPointerDown).toHaveBeenCalledOnce()

    const gateButton = await screen.findByRole('button', { name: 'preview.graphPdfLoad' })
    fireEvent.pointerDown(gateButton.closest('[data-slot="graph-pdf-preview-gate"]')!)
    expect(parentPointerDown).toHaveBeenCalledOnce()
  })

  it('keeps plain wheel scrolling inside graph content but preserves modified canvas zoom', async () => {
    const parentWheel = vi.fn()
    resolveEmbeddedPreviewTarget.mockResolvedValue(resolvedPdf)

    renderPreview({ onWheel: parentWheel, variant: 'graph' })
    fireEvent.click(await screen.findByRole('button', { name: 'preview.graphPdfLoad' }))
    const surface = await screen.findByTestId('file-preview-surface')

    fireEvent.wheel(surface)
    expect(parentWheel).not.toHaveBeenCalled()

    fireEvent.wheel(surface, { ctrlKey: true })
    expect(parentWheel).toHaveBeenCalledOnce()
  })
})
