import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AllPagesResults } from '@/pages/all-pages/AllPagesResults'

const t = (key: string) => {
  const labels: Record<string, string> = {
    'allPages.clearFilters': 'Clear filters',
    'allPages.emptyDescription': 'Adjust filters.',
    'allPages.emptyTitle': 'No matching pages',
  }
  return labels[key] ?? key
}

describe('AllPagesResults', () => {
  it('shows a clear filters action for empty filtered results', async () => {
    const onClearFilters = vi.fn()

    render(
      <AllPagesResults
        hasActiveFilters
        rows={[]}
        viewMode="table"
        onClearFilters={onClearFilters}
        onOpenFile={vi.fn()}
        t={t}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('hides the clear filters action for an unfiltered empty workspace', () => {
    render(
      <AllPagesResults
        hasActiveFilters={false}
        rows={[]}
        viewMode="table"
        onClearFilters={vi.fn()}
        onOpenFile={vi.fn()}
        t={t}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })
})
