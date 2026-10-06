import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ZoomableVisualViewport } from '@/components/previews/ZoomableVisualViewport'

const labels = {
  resetZoom: 'Reset zoom',
  zoomIn: 'Zoom in',
  zoomLevel: 'Visual zoom level',
  zoomOut: 'Zoom out',
}

describe('ZoomableVisualViewport', () => {
  it('makes the scroll viewport keyboard-focusable', async () => {
    const user = userEvent.setup()
    render(
      <ZoomableVisualViewport
        labels={labels}
        visual={{ alt: 'Architecture', kind: 'image', src: 'asset://architecture.png' }}
      />,
    )

    await user.tab()
    await user.tab()
    await user.tab()

    expect(screen.getByRole('group', { name: 'Visual zoom level' })).toBeInTheDocument()
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Visual zoom level' })).toHaveFocus()
    expect(screen.getByRole('region', { name: 'Visual zoom level' })).toHaveClass(
      'focus-visible:ring-2',
    )
  })

  it('renders an image at its natural size and supports wheel and button zoom', () => {
    const parentWheel = vi.fn()
    render(
      <div onWheel={parentWheel}>
        <ZoomableVisualViewport
          labels={labels}
          visual={{
            alt: 'Architecture',
            kind: 'image',
            naturalHeight: 600,
            naturalWidth: 1200,
            src: 'asset://architecture.png',
          }}
        />
      </div>,
    )

    const image = screen.getByRole('img', { name: 'Architecture' })
    expect(image).toHaveStyle({ height: '600px', width: '1200px' })
    const viewport = screen.getByRole('region', { name: 'Visual zoom level' })

    const wheel = createEvent.wheel(viewport, { cancelable: true, deltaY: -100 })
    fireEvent(viewport, wheel)
    expect(parentWheel).not.toHaveBeenCalled()
    expect(screen.getByText('125%')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(screen.getByText('100%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }))
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('clones an SVG, normalizes its baseline, clamps zoom, and pans', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 900 450')
    svg.innerHTML = '<text>Safe diagram</text>'
    render(<ZoomableVisualViewport labels={labels} visual={{ kind: 'svg', node: svg }} />)

    const renderedSvg = screen.getByText('Safe diagram').closest('svg')
    expect(renderedSvg).not.toBe(svg)
    expect(renderedSvg).toHaveStyle({ height: '450px', width: '900px' })

    const viewport = screen.getByRole('region', { name: 'Visual zoom level' })
    for (let step = 0; step < 8; step += 1) fireEvent.wheel(viewport, { deltaY: -100 })
    expect(screen.getByText('200%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled()

    fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 100, pointerId: 7 })
    fireEvent.pointerMove(viewport, { clientX: 40, clientY: 20, pointerId: 7 })
    fireEvent.pointerUp(viewport, { pointerId: 7 })
    expect(viewport.scrollLeft).toBe(60)
    expect(viewport.scrollTop).toBe(80)
  })
})
