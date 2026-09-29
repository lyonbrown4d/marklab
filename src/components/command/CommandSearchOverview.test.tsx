import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CommandSearchOverview from '@/components/command/CommandSearchOverview'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('CommandSearchOverview', () => {
  it('presents search scopes as a visible single-choice control', () => {
    render(
      <CommandSearchOverview
        actionsOnly={false}
        scope="headings"
        onSelectScope={vi.fn()}
        onToggleActions={vi.fn()}
      />,
    )

    expect(screen.getByRole('group', { name: 'command.search.filters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '# command.search.scopeHeadings' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '@ command.search.scopeFiles' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
