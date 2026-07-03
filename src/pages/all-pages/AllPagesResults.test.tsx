import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { AllPagesRow } from '@/logic/allPages'
import { AllPagesResults } from '@/pages/all-pages/AllPagesResults'

const t = (key: string) => {
  const labels: Record<string, string> = {
    'allPages.clearFilters': 'Clear filters',
    'allPages.columnAssets': 'Assets',
    'allPages.columnFolder': 'Folder',
    'allPages.columnHeadings': 'Headings',
    'allPages.columnIssues': 'Issues',
    'allPages.columnLinks': 'Links',
    'allPages.columnTitle': 'Title',
    'allPages.emptyDescription': 'Adjust filters.',
    'allPages.emptyTitle': 'No matching pages',
    'common.no': 'No',
  }
  return labels[key] ?? key
}

const rows: AllPagesRow[] = [
  {
    assets: 1,
    folder: 'docs',
    headings: 3,
    indexed: true,
    issues: 0,
    links: 4,
    path: 'docs/guide.md',
    title: 'Guide',
  },
  {
    assets: 0,
    folder: 'notes',
    headings: 2,
    indexed: true,
    issues: 1,
    links: 1,
    path: 'notes/idea.md',
    title: 'Idea',
  },
]

const renderResults = (overrides: Partial<Parameters<typeof AllPagesResults>[0]> = {}) => {
  const props = {
    hasActiveFilters: false,
    rows,
    viewMode: 'table' as const,
    onClearFilters: vi.fn(),
    onOpenFile: vi.fn(),
    t,
    ...overrides,
  }

  render(<AllPagesResults {...props} />)
  return props
}

describe('AllPagesResults', () => {
  it('shows a clear filters action for empty filtered results', async () => {
    const onClearFilters = vi.fn()

    renderResults({
      hasActiveFilters: true,
      rows: [],
      onClearFilters,
    })

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('hides the clear filters action for an unfiltered empty workspace', () => {
    renderResults({
      rows: [],
    })

    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })

  it('opens a page from table view', async () => {
    const { onOpenFile } = renderResults({ viewMode: 'table' })

    await userEvent.click(screen.getByRole('button', { name: /Guide/ }))

    expect(onOpenFile).toHaveBeenCalledWith('docs/guide.md')
  })

  it('opens a page from card view', async () => {
    const { onOpenFile } = renderResults({ viewMode: 'cards' })

    await userEvent.click(screen.getByRole('button', { name: /Idea/ }))

    expect(onOpenFile).toHaveBeenCalledWith('notes/idea.md')
  })

  it('opens a page from folder board view', async () => {
    const { onOpenFile } = renderResults({ viewMode: 'folders' })

    await userEvent.click(screen.getByRole('button', { name: /Guide/ }))

    expect(onOpenFile).toHaveBeenCalledWith('docs/guide.md')
  })
})
