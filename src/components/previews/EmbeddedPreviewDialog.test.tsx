import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EmbeddedPreviewDialog } from '@/components/previews/EmbeddedPreviewDialog'

const filePreviewSurface = vi.hoisted(() => vi.fn(() => <div>File preview</div>))

vi.mock('@/components/previews/FilePreviewSurface', () => ({ default: filePreviewSurface }))
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'preview.imageAlt': 'Architecture preview',
        'preview.visualResetZoom': 'Reset zoom',
        'preview.visualZoomIn': 'Zoom in',
        'preview.visualZoomLevel': 'Visual zoom level',
        'preview.visualZoomOut': 'Zoom out',
      })[key] ?? key,
  }),
}))

const baseProps = {
  failed: false,
  failedLabel: 'Preview failed',
  loadingLabel: 'Loading preview',
  onOpenChange: vi.fn(),
  open: true,
  ready: true,
  target: './architecture.png',
  title: 'Architecture',
}

describe('EmbeddedPreviewDialog', () => {
  it('reuses its existing dialog for a zoomable image', () => {
    render(
      <EmbeddedPreviewDialog
        {...baseProps}
        resolved={{
          external: false,
          kind: 'image',
          path: 'images/architecture.png',
          readonly: true,
          src: 'asset://images/architecture.png',
        }}
      />,
    )

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'Architecture preview' })).toHaveAttribute(
      'src',
      'asset://images/architecture.png',
    )
    expect(screen.getByRole('region', { name: 'Visual zoom level' })).toBeInTheDocument()
    expect(filePreviewSurface).not.toHaveBeenCalled()
  })

  it('keeps non-image resources on their existing preview surface', () => {
    render(
      <EmbeddedPreviewDialog
        {...baseProps}
        resolved={{
          external: false,
          kind: 'pdf',
          path: 'docs/brief.pdf',
          readonly: true,
          src: 'asset://docs/brief.pdf',
        }}
      />,
    )

    expect(screen.getByText('File preview')).toBeInTheDocument()
    expect(filePreviewSurface).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'pdf', presentation: 'full' }),
      undefined,
    )
  })
})
