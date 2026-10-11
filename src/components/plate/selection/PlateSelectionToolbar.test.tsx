import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlateSelectionToolbar } from '@/components/plate/selection/PlateSelectionToolbar'
import type { PlateSelectionToolbarController } from '@/components/plate/usePlateSelectionToolbar'

const labels = {
  blockStyle: 'Block style',
  bold: 'Bold',
  bulletList: 'Bullet list',
  clear: 'Clear formatting',
  code: 'Inline code',
  copyError: 'Could not copy Markdown',
  copyMarkdown: 'Copy as Markdown',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  italic: 'Italic',
  link: 'Link',
  more: 'More',
  orderedList: 'Ordered list',
  paragraph: 'Paragraph',
  quote: 'Quote',
  strike: 'Strikethrough',
  toolbar: 'Text formatting',
}

const createController = (
  overrides: Partial<PlateSelectionToolbarController> = {},
): PlateSelectionToolbarController => ({
  activeMarks: { bold: true, code: false, italic: false, link: false, strike: false },
  anchor: { left: 160, top: 90 },
  captureSelection: vi.fn(() => true),
  open: true,
  runAction: vi.fn(() => true),
  runMoreAction: vi.fn(() => true),
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

    expect(controller.captureSelection).toHaveBeenCalledOnce()
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

  it('runs clear formatting and accepts a computed floating position', () => {
    const runAction = vi.fn(() => true)
    render(
      <PlateSelectionToolbar
        {...createController({
          floatingStyle: { left: 240, position: 'fixed', top: 120 },
          runAction,
        })}
        labels={labels}
      />,
    )

    fireEvent.mouseDown(screen.getByRole('button', { name: labels.clear }))
    fireEvent.click(screen.getByRole('button', { name: labels.clear }))

    expect(runAction).toHaveBeenCalledExactlyOnceWith('clear')
  })

  it('offers block and clipboard actions without an AI entry in More', async () => {
    const user = userEvent.setup()
    const runMoreAction = vi.fn(() => true)
    render(<PlateSelectionToolbar {...createController({ runMoreAction })} labels={labels} />)

    await user.click(screen.getByRole('button', { name: labels.more }))
    await user.click(await screen.findByRole('menuitem', { name: labels.heading2 }))
    expect(runMoreAction).toHaveBeenCalledWith('heading2')

    await user.click(screen.getByRole('button', { name: labels.more }))
    await user.click(await screen.findByRole('menuitem', { name: labels.copyMarkdown }))
    expect(runMoreAction).toHaveBeenCalledWith('copyMarkdown')

    await user.click(screen.getByRole('button', { name: labels.more }))
    expect(await screen.findByRole('menuitem', { name: labels.copyMarkdown })).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: /AI/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(8)
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
