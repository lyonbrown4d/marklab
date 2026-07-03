import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
    expect(overlay).toHaveClass('pointer-events-none', 'absolute', 'inset-0')

    const empty = container.querySelector('[data-slot="empty"]')
    expect(empty).toHaveClass('flex-none', 'max-w-sm', 'bg-card/95', 'shadow-sm')

    const media = container.querySelector('[data-slot="empty-icon"]')
    expect(media).toHaveClass('size-10', 'text-primary')

    const icon = container.querySelector('svg')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveClass('size-5')
  })
})
