import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isCommandPaletteBlockedByActiveSurface,
  useNativeSurfaceOcclusionStore,
} from '@/app/nativeSurfaceOcclusion'
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
  beforeEach(() => {
    useNativeSurfaceOcclusionStore.setState({ reasons: {}, commandPaletteBlockers: {} })
  })

  it('blocks Search Everywhere only while its modal is open', () => {
    const props = {
      ...baseProps,
      resolved: null,
    }
    const { rerender } = render(<EmbeddedPreviewDialog {...props} />)

    expect(isCommandPaletteBlockedByActiveSurface()).toBe(true)

    rerender(<EmbeddedPreviewDialog {...props} open={false} />)
    expect(isCommandPaletteBlockedByActiveSurface()).toBe(false)
  })

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

  it('lets the spreadsheet preview resize by keyboard within viewport bounds', () => {
    render(
      <EmbeddedPreviewDialog
        {...baseProps}
        resolved={{
          external: false,
          kind: 'spreadsheet',
          path: 'docs/report.xlsx',
          readonly: true,
          src: 'asset://docs/report.xlsx',
        }}
      />,
    )
    const dialog = screen.getByRole('dialog')
    const resize = screen.getAllByRole('separator', { name: 'preview.resizeWidth' })[0]!
    fireEvent.keyDown(resize, { key: 'Home' })
    expect(dialog).toHaveStyle({ width: '480px' })
    fireEvent.keyDown(resize, { key: 'ArrowLeft' })
    expect(dialog).toHaveStyle({ width: '480px' })
    fireEvent.keyDown(resize, { key: 'End' })
    expect(dialog).toHaveStyle({ width: `${window.innerWidth * 0.96}px` })
    const heightResize = screen.getAllByRole('separator', { name: 'preview.resizeHeight' })[0]!
    fireEvent.keyDown(heightResize, { key: 'Home' })
    expect(dialog).toHaveStyle({ height: '280px' })
    fireEvent.keyDown(heightResize, { key: 'ArrowDown', shiftKey: true })
    expect(dialog).toHaveStyle({ height: '344px' })
    fireEvent.keyDown(heightResize, { key: 'End' })
    expect(dialog).toHaveStyle({ height: `${window.innerHeight * 0.96}px` })
  })
})
