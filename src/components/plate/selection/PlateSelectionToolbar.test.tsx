import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlateSelectionToolbar } from '@/components/plate/selection/PlateSelectionToolbar'
import type { PlateSelectionToolbarController } from '@/components/plate/usePlateSelectionToolbar'

const labels = {
  bold: 'Bold',
  clear: 'Clear formatting',
  code: 'Inline code',
  italic: 'Italic',
  link: 'Link',
  strike: 'Strikethrough',
  toolbar: 'Text formatting',
}

const createController = (
  overrides: Partial<PlateSelectionToolbarController> = {},
): PlateSelectionToolbarController => ({
  activeMarks: { bold: true, code: false, italic: false, link: false, strike: false },
  anchor: { left: 160, top: 90 },
  open: true,
  runAction: vi.fn(() => true),
  setToolbarElement: vi.fn(),
  ...overrides,
})

describe('PlateSelectionToolbar', () => {
  it('exposes accessible formatting controls and their pressed state', () => {
    const controller = createController()
    render(<PlateSelectionToolbar {...controller} labels={labels} />)

    expect(screen.getByRole('toolbar', { name: labels.toolbar })).toBeVisible()
    expect(screen.getByRole('button', { name: labels.bold })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    fireEvent.mouseDown(screen.getByRole('button', { name: labels.italic }))
    fireEvent.click(screen.getByRole('button', { name: labels.italic }))

    expect(controller.runAction).toHaveBeenCalledWith('italic')
  })

  it('does not render when the selection is unavailable', () => {
    render(<PlateSelectionToolbar {...createController({ open: false })} labels={labels} />)

    expect(screen.queryByRole('toolbar', { name: labels.toolbar })).not.toBeInTheDocument()
  })

  it('supports a custom link action through the controller', () => {
    const runAction = vi.fn(() => true)
    const controller = createController({ runAction })
    render(<PlateSelectionToolbar {...controller} labels={labels} />)

    fireEvent.click(screen.getByRole('button', { name: labels.link }))

    expect(runAction).toHaveBeenCalledWith('link')
  })

  it('does not place a fixed viewport anchor inside transformed editor ancestors', () => {
    const { container } = render(
      <div style={{ transform: 'translateY(24px)' }}>
        <PlateSelectionToolbar {...createController()} labels={labels} />
      </div>,
    )

    expect(container.querySelector('span[aria-hidden="true"].fixed')).not.toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: labels.toolbar })).toBeVisible()
  })
})
