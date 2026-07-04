import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GraphEmptyState } from '@/pages/graph/GraphEmptyState'

describe('GraphEmptyState', () => {
  it('renders an accessible empty state with stable graph icon sizing', () => {
    const { container } = render(
      <GraphEmptyState
        title="No graph results"
        description="Create links between documents to populate this graph."
      />,
    )

    expect(screen.getByText('No graph results')).toBeInTheDocument()
    expect(
      screen.getByText('Create links between documents to populate this graph.'),
    ).toBeInTheDocument()

    const overlay = container.firstElementChild
    expect(overlay).toHaveAttribute('role', 'status')
    expect(overlay).toHaveAttribute('aria-live', 'polite')
    expect(overlay).toHaveAttribute('aria-atomic', 'true')
    expect(overlay).toHaveAccessibleName('No graph results')
    expect(overlay).toHaveAccessibleDescription(
      'Create links between documents to populate this graph.',
    )
    expect(overlay).toHaveClass('graph-empty-state', 'pointer-events-none', 'absolute', 'inset-0')

    const empty = container.querySelector('[data-slot="empty"]')
    expect(empty).toHaveClass('flex-none', 'max-w-sm', 'bg-card/95', 'shadow-sm')

    const media = container.querySelector('[data-slot="empty-icon"]')
    expect(media).toHaveClass('size-10', 'text-primary')

    const icon = container.querySelector('svg')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveClass('size-5')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers an inline action for recoverable filtered empty states', () => {
    const onAction = vi.fn()
    render(
      <GraphEmptyState
        title="No matching nodes"
        description="Adjust search or filters to bring graph nodes back."
        actionLabel="Reset"
        onAction={onAction}
      />,
    )

    const region = screen.getByRole('region', { name: 'No matching nodes' })
    expect(region).toHaveAccessibleDescription(
      'Adjust search or filters to bring graph nodes back.',
    )
    expect(region).toHaveAttribute('aria-live', 'polite')

    const action = screen.getByRole('button', { name: 'Reset' })
    expect(action).toHaveClass('pointer-events-auto', 'h-8')

    fireEvent.click(action)

    expect(onAction).toHaveBeenCalledTimes(1)
  })
})
