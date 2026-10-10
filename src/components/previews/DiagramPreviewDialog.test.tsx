import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isCommandPaletteBlockedByActiveSurface,
  useNativeSurfaceOcclusionStore,
} from '@/app/nativeSurfaceOcclusion'
import { DiagramPreviewDialog } from '@/components/previews/DiagramPreviewDialog'

const labels = {
  resetZoom: 'Reset zoom',
  title: 'Diagram preview',
  zoomIn: 'Zoom in',
  zoomLevel: 'Diagram zoom level',
  zoomOut: 'Zoom out',
}

describe('DiagramPreviewDialog', () => {
  beforeEach(() => {
    useNativeSurfaceOcclusionStore.setState({ reasons: {}, commandPaletteBlockers: {} })
  })

  it('blocks Search Everywhere only while its modal is open', () => {
    const props = {
      labels,
      onOpenChange: vi.fn(),
      returnFocusRef: createRef<HTMLButtonElement>(),
      visual: { alt: 'System map', kind: 'image', src: 'asset://map.png' } as const,
    }
    const { rerender } = render(<DiagramPreviewDialog {...props} open />)

    expect(isCommandPaletteBlockedByActiveSurface()).toBe(true)

    rerender(<DiagramPreviewDialog {...props} open={false} />)
    expect(isCommandPaletteBlockedByActiveSurface()).toBe(false)
  })

  it('renders an explicit image visual and contains editor events', () => {
    const onOpenChange = vi.fn()
    const parentPointerDown = vi.fn()
    render(
      <div onPointerDown={parentPointerDown}>
        <DiagramPreviewDialog
          labels={labels}
          onOpenChange={onOpenChange}
          open
          returnFocusRef={createRef<HTMLButtonElement>()}
          visual={{ alt: 'System map', kind: 'image', src: 'asset://map.png' }}
        />
      </div>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Diagram preview' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveClass('transform-gpu', 'will-change-auto')
    expect(dialog).not.toHaveClass('will-change-transform')
    expect(screen.getByRole('img', { name: 'System map' })).toHaveAttribute(
      'src',
      'asset://map.png',
    )
    fireEvent.pointerDown(screen.getByRole('region', { name: 'Diagram zoom level' }))
    expect(parentPointerDown).not.toHaveBeenCalled()
  })

  it('closes on Escape without bubbling and restores trigger focus', () => {
    const onOpenChange = vi.fn()
    const parentKeyDown = vi.fn()
    const returnFocusRef = createRef<HTMLButtonElement>()
    render(
      <div onKeyDown={parentKeyDown}>
        <button ref={returnFocusRef}>Expand</button>
        <DiagramPreviewDialog
          labels={labels}
          onOpenChange={onOpenChange}
          open
          returnFocusRef={returnFocusRef}
          visual={{ alt: 'System map', kind: 'image', src: 'asset://map.png' }}
        />
      </div>,
    )

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(parentKeyDown).not.toHaveBeenCalled()
  })
})
