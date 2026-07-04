import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { AllPagesFilters } from '@/logic/allPages'
import { AllPagesActiveFilters } from '@/pages/all-pages/AllPagesActiveFilters'

const t = (key: string, options?: Record<string, unknown>) => {
  const labels: Record<string, string> = {
    'allPages.activeFilter.folder': `Folder: ${options?.value ?? ''}`,
    'allPages.activeFilter.issues': 'With issues',
    'allPages.activeFilter.query': `Search: ${options?.value ?? ''}`,
    'allPages.activeFilter.sort': `Sort: ${options?.value ?? ''}`,
    'allPages.activeFilter.view': `View: ${options?.value ?? ''}`,
    'allPages.activeFilters': 'Active filters',
    'allPages.activeFiltersEmpty': 'No extra filters are applied.',
    'allPages.clearFilters': 'Clear filters',
    'allPages.sort.issues': 'Issues',
    'allPages.sort.title': 'Title',
    'allPages.view.cards': 'Cards',
    'allPages.view.table': 'Table',
  }

  return labels[key] ?? key
}

const baseFilters: AllPagesFilters = {
  folder: 'all',
  issuesOnly: false,
  query: '',
  sort: 'title',
}

describe('AllPagesActiveFilters', () => {
  it('uses shadcn empty slots when no filters are active', () => {
    const { container } = render(
      <AllPagesActiveFilters
        filters={baseFilters}
        hasActiveFilters={false}
        onClear={vi.fn()}
        t={t}
        viewMode="table"
      />,
    )

    const empty = screen.getByRole('status')

    expect(empty).toHaveTextContent('No extra filters are applied.')
    expect(empty.querySelector('[data-slot="empty-title"]')).toHaveTextContent('Active filters')
    expect(container.querySelector('[data-slot="empty"]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled()
  })

  it('renders active filter chips and enables clearing', () => {
    render(
      <AllPagesActiveFilters
        filters={{
          folder: 'docs',
          issuesOnly: true,
          query: 'graph',
          sort: 'issues',
        }}
        hasActiveFilters
        onClear={vi.fn()}
        t={t}
        viewMode="cards"
      />,
    )

    expect(screen.getByText('Search: graph')).toBeInTheDocument()
    expect(screen.getByText('Folder: docs')).toBeInTheDocument()
    expect(screen.getByText('With issues')).toBeInTheDocument()
    expect(screen.getByText('Sort: Issues')).toBeInTheDocument()
    expect(screen.getByText('View: Cards')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
