import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InspectorEmptyState } from '@/components/RightSidebarPrimitives'

describe('InspectorEmptyState', () => {
  it('uses the shared empty-state semantics in compact inspector panels', () => {
    const { container } = render(
      <InspectorEmptyState
        icon={<span aria-hidden="true">i</span>}
        title="No outline"
        description="Add Markdown headings to populate the inspector."
      />,
    )

    const heading = screen.getByRole('heading', { name: 'No outline' })

    expect(heading).toHaveAttribute('aria-level', '3')
    expect(screen.getByText('Add Markdown headings to populate the inspector.')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="empty"]')).toHaveClass('min-h-32')
  })
})
