import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MermaidPreview from '@/components/previews/MermaidPreview'

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }))

vi.mock('mermaid', () => ({ default: mermaid }))

describe('MermaidPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mermaid.initialize.mockReset()
    mermaid.render.mockReset().mockResolvedValue({
      svg: '<svg><text>Diagram</text></svg>',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lazily renders with strict security after the debounce', async () => {
    render(<MermaidPreview source={'graph TD\nA --> B'} />)

    expect(screen.getByText(/Loading diagram/)).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Diagram')).toHaveTextContent('Diagram')
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlLabels: false,
        securityLevel: 'strict',
        startOnLoad: false,
      }),
    )
    expect(mermaid.initialize.mock.calls[0]?.[0]).not.toHaveProperty('flowchart.htmlLabels')
  })

  it('opens one sanitized render in a large dialog without re-rendering Mermaid', async () => {
    const parentEvents = {
      click: vi.fn(),
      mouseDown: vi.fn(),
      pointerDown: vi.fn(),
    }
    mermaid.render.mockResolvedValueOnce({
      svg: '<svg onclick="alert(1)"><script>alert(1)</script><text>Diagram</text></svg>',
    })
    render(
      <div
        onClick={parentEvents.click}
        onMouseDown={parentEvents.mouseDown}
        onPointerDown={parentEvents.pointerDown}
      >
        <MermaidPreview source={'graph TD\nA --> B'} />
      </div>,
    )

    expect(screen.queryByRole('button', { name: 'Expand diagram' })).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    const expandButton = screen.getByRole('button', { name: 'Expand diagram' })
    fireEvent.pointerDown(expandButton)
    fireEvent.mouseDown(expandButton)
    fireEvent.click(expandButton)

    const dialog = screen.getByRole('dialog', { name: 'Mermaid diagram preview' })
    expect(dialog).toHaveClass('h-[92vh]', 'max-w-[96vw]')
    expect(document.querySelector('[data-plate-preview="mermaid"] svg text')).toHaveTextContent(
      'Diagram',
    )
    expect(dialog.querySelector('svg text')).toHaveTextContent('Diagram')
    expect(document.querySelectorAll('script')).toHaveLength(0)
    expect(document.querySelectorAll('svg[onclick]')).toHaveLength(0)
    expect(mermaid.render).toHaveBeenCalledTimes(1)
    expect(parentEvents.pointerDown).not.toHaveBeenCalled()
    expect(parentEvents.mouseDown).not.toHaveBeenCalled()
    expect(parentEvents.click).not.toHaveBeenCalled()
  })

  it('preserves a wide SVG baseline and supports zooming and panning its scroll surface', async () => {
    const handleWheel = vi.fn()
    mermaid.render.mockResolvedValueOnce({
      svg: '<svg width="100%" style="max-width: 1200px" viewBox="0 0 1200 600"><text>Wide diagram</text></svg>',
    })
    render(
      <div onWheel={handleWheel}>
        <MermaidPreview source={'graph LR\nA --> B'} />
      </div>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Expand diagram' }))

    const dialog = screen.getByRole('dialog', { name: 'Mermaid diagram preview' })
    const svg = dialog.querySelector<SVGSVGElement>('svg[viewBox="0 0 1200 600"]')
    const zoomSurface = svg?.parentElement as HTMLDivElement
    const scrollSurface = zoomSurface.parentElement as HTMLDivElement
    expect(svg).not.toHaveAttribute('width')
    expect(svg).toHaveStyle({ height: '600px', maxWidth: '', width: '1200px' })
    expect(scrollSurface).toHaveClass('overflow-auto')

    const plainWheel = createEvent.wheel(scrollSurface, { deltaY: -100 })
    fireEvent(scrollSurface, plainWheel)
    expect(screen.getByText('125%')).toBeInTheDocument()

    const zoomWheel = createEvent.wheel(scrollSurface, { ctrlKey: true, deltaY: -100 })
    fireEvent(scrollSurface, zoomWheel)
    expect(screen.getByText('150%')).toBeInTheDocument()
    expect(zoomSurface).toHaveStyle({ zoom: '1.5' })
    expect(Number.parseFloat(svg?.style.width ?? '') * Number(zoomSurface.style.zoom)).toBe(1800)

    for (let step = 0; step < 10; step += 1) {
      fireEvent.wheel(scrollSurface, { deltaY: -100 })
    }
    expect(screen.getByText('200%')).toBeInTheDocument()
    for (let step = 0; step < 10; step += 1) {
      fireEvent.wheel(scrollSurface, { deltaY: 100 })
    }
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(handleWheel).not.toHaveBeenCalled()

    fireEvent.pointerDown(scrollSurface, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(scrollSurface, { clientX: 40, clientY: 30, pointerId: 1 })
    fireEvent.pointerUp(scrollSurface, { pointerId: 1 })
    expect(scrollSurface.scrollLeft).toBe(60)
    expect(scrollSurface.scrollTop).toBe(70)
  })

  it('supports zooming and resetting the expanded diagram', async () => {
    render(<MermaidPreview source={'graph TD\nA --> B'} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Expand diagram' }))

    expect(screen.getByText('100%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByText('125%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(screen.getByText('100%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }))
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('closes only the dialog on Escape and restores focus to the expand button', async () => {
    const handleKeyDown = vi.fn()
    render(
      <div onKeyDown={handleKeyDown}>
        <MermaidPreview source={'graph TD\nA --> B'} />
      </div>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
      await Promise.resolve()
    })
    vi.useRealTimers()
    const user = userEvent.setup()
    const expandButton = screen.getByRole('button', { name: 'Expand diagram' })
    await user.click(expandButton)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(expandButton).toHaveFocus()
    expect(handleKeyDown).not.toHaveBeenCalled()
  })

  it('does not reopen the expanded diagram after the source changes from A to B and back', async () => {
    const sourceA = 'graph TD\nA --> B'
    const sourceB = 'graph TD\nA --> C'
    const { rerender } = render(<MermaidPreview source={sourceA} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Expand diagram' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    rerender(<MermaidPreview source={sourceB} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<MermaidPreview source={sourceA} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clamps zoom from 50% to 200% and resets to 100% after reopening', async () => {
    render(<MermaidPreview source={'graph TD\nA --> B'} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
      await Promise.resolve()
    })
    const expandButton = screen.getByRole('button', { name: 'Expand diagram' })
    fireEvent.click(expandButton)

    const zoomOutButton = screen.getByRole('button', { name: 'Zoom out' })
    fireEvent.click(zoomOutButton)
    fireEvent.click(zoomOutButton)
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(zoomOutButton).toBeDisabled()

    const zoomInButton = screen.getByRole('button', { name: 'Zoom in' })
    for (let step = 0; step < 6; step += 1) fireEvent.click(zoomInButton)
    expect(screen.getByText('200%')).toBeInTheDocument()
    expect(zoomInButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(expandButton)
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toBeDisabled()
  })

  it('shows a text-only error without injecting rejected content', async () => {
    mermaid.render.mockRejectedValueOnce(new Error('<img src=x onerror=alert(1)>'))
    render(<MermaidPreview source="invalid" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByRole('alert')).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(document.querySelector('img')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Expand diagram' })).not.toBeInTheDocument()
  })

  it('reports Mermaid output that cannot be safely parsed instead of leaving a blank preview', async () => {
    mermaid.render.mockResolvedValueOnce({
      svg: '<html><body>not an svg</body></html>',
    })
    render(<MermaidPreview source="flowchart TD\nA --> B" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(document.querySelector('[data-plate-preview="mermaid"] svg')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Expand diagram' })).not.toBeInTheDocument()
  })

  it('delegates concurrent rendering to the Mermaid execution queue', async () => {
    render(
      <>
        <MermaidPreview source={'graph TD\nA --> B'} />
        <MermaidPreview source={'sequenceDiagram\nA->>B: Hello'} />
      </>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mermaid.render).toHaveBeenCalledTimes(2)
    expect(mermaid.initialize).toHaveBeenCalledTimes(2)
  })
})
