import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SettingsEmptyState } from '@/components/settings/SettingsButtons'

describe('SettingsEmptyState', () => {
  it('uses shadcn empty slots while preserving compact settings semantics', () => {
    const { container } = render(<SettingsEmptyState>No matches</SettingsEmptyState>)

    expect(screen.getByRole('note')).toHaveTextContent('No matches')
    expect(screen.getByRole('heading', { name: 'No matches' })).toHaveAttribute('aria-level', '3')
    expect(container.querySelector('[data-slot="empty"]')).toHaveClass('min-h-0', 'bg-muted/30')
  })
})
