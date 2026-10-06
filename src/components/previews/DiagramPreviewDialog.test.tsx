import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DiagramPreviewDialog } from '@/components/previews/DiagramPreviewDialog'

const labels = {
  resetZoom: 'Reset zoom',
  title: 'Diagram preview',
  zoomIn: 'Zoom in',
  zoomLevel: 'Diagram zoom level',
  zoomOut: 'Zoom out',
}

describe('DiagramPreviewDialog', () => {
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

    expect(screen.getByRole('dialog', { name: 'Diagram preview' })).toBeInTheDocument()
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
