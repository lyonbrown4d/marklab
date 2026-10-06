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

  it('renders an image at its natural size and keeps plain trackpad scrolling local', () => {
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

    const wheel = createEvent.wheel(viewport, {
      cancelable: true,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
      deltaX: 2,
      deltaY: 3,
    })
    fireEvent(viewport, wheel)
    expect(wheel.defaultPrevented).toBe(true)
    expect(parentWheel).not.toHaveBeenCalled()
    expect(viewport.scrollLeft).toBe(32)
    expect(viewport.scrollTop).toBe(48)
    expect(screen.getByText('100%')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByText('125%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }))
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('continuously zooms modified wheel gestures around the pointer', () => {
    render(
      <ZoomableVisualViewport
        labels={labels}
        visual={{ alt: 'Architecture', kind: 'image', src: 'asset://architecture.png' }}
      />,
    )

    const viewport = screen.getByRole('region', { name: 'Visual zoom level' })
    viewport.scrollLeft = 200
    viewport.scrollTop = 100
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      bottom: 620,
      height: 600,
      left: 10,
      right: 1010,
      top: 20,
      width: 1000,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    })

    const transformSurface = screen.getByRole('img', { name: 'Architecture' }).parentElement
    const visualSurface = transformSurface?.parentElement
    Object.defineProperties(visualSurface, {
      offsetLeft: { configurable: true, value: 16 },
      offsetTop: { configurable: true, value: 12 },
    })

    fireEvent.wheel(viewport, {
      clientX: 110,
      clientY: 100,
      ctrlKey: true,
      deltaY: -100,
    })

    const zoom = Math.exp(0.25)
    expect(zoom).toBeGreaterThan(1)
    expect(zoom).toBeLessThan(1.5)
    expect(transformSurface?.style.transform).toContain(`scale(${zoom})`)
    expect(viewport.scrollLeft).toBeCloseTo(16 + 284 * zoom - 100)
    expect(viewport.scrollTop).toBeCloseTo(12 + 168 * zoom - 80)

    fireEvent.wheel(viewport, { deltaY: 1, metaKey: true })
    expect(transformSurface?.style.transform).not.toContain(`scale(${zoom})`)
  })

  it('uses a bounded GPU transform with a scaled scroll extent', () => {
    const { container } = render(
      <ZoomableVisualViewport
        labels={labels}
        visual={{
          alt: 'Architecture',
          kind: 'image',
          naturalHeight: 600,
          naturalWidth: 1200,
          src: 'asset://architecture.png',
        }}
      />,
    )

    fireEvent.wheel(screen.getByRole('region', { name: 'Visual zoom level' }), {
      ctrlKey: true,
      deltaY: -100,
    })

    const spacer = container.querySelector<HTMLElement>('[data-visual-spacer]')
    const transform = container.querySelector<HTMLElement>('[data-visual-transform]')
    expect(Number.parseFloat(spacer?.style.height ?? '')).toBeCloseTo(600 * Math.exp(0.25), 2)
    expect(Number.parseFloat(spacer?.style.width ?? '')).toBeCloseTo(1200 * Math.exp(0.25), 2)
    expect(transform?.style.transform).toContain('translate3d(0px, 0px, 0px)')
    expect(transform?.style.transform).toContain(`scale(${Math.exp(0.25)})`)
    expect(transform?.style.zoom).toBe('')
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
    for (let step = 0; step < 8; step += 1) {
      fireEvent.wheel(viewport, { ctrlKey: true, deltaY: -100 })
    }
    expect(screen.getByText('200%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled()

    fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 100, pointerId: 7 })
    fireEvent.pointerMove(viewport, { clientX: 40, clientY: 20, pointerId: 7 })
    fireEvent.pointerUp(viewport, { pointerId: 7 })
    expect(viewport.scrollLeft).toBe(60)
    expect(viewport.scrollTop).toBe(80)
  })
})
