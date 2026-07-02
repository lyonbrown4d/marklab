import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState, Section, StatusRow } from '@/components/status-center/StatusCenterRows'

describe('StatusCenterRows', () => {
  it('labels status center sections as named regions', () => {
    render(
      <Section title="Background tasks">
        <StatusRow dotClassName="bg-primary" meta="Running index refresh">
          Knowledge index
        </StatusRow>
      </Section>,
    )

    const section = screen.getByRole('region', { name: 'Background tasks' })

    expect(within(section).getByText('Knowledge index')).toBeInTheDocument()
    expect(within(section).getByText('Running index refresh')).toHaveAttribute(
      'title',
      'Running index refresh',
    )
    expect(section.querySelector('[data-status-dot="true"]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders empty states as notes instead of color-only rows', () => {
    render(<EmptyState label="No background tasks" />)

    expect(screen.getByRole('note')).toHaveTextContent('No background tasks')
  })
})
