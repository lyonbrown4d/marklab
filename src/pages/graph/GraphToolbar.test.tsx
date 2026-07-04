import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GraphToolbar } from '@/pages/graph/GraphToolbar'
import type { GraphFilterState, GraphFilterStats } from '@/logic/graphViewModel'

const messages: Record<string, string> = {
  'graph.edges': 'edges',
  'graph.filterExternal': 'External',
  'graph.filterFiles': 'Files',
  'graph.filterGroup': 'Graph node kind filters',
  'graph.filterHeadings': 'Headings',
  'graph.filterMissing': 'Missing',
  'graph.filterPreview': 'Previews',
  'graph.nodes': 'nodes',
  'graph.resetFilters': 'Reset',
  'graph.searchPlaceholder': 'Filter graph...',
  'graph.visible': 'Visible',
}

const filters: GraphFilterState = {
  query: '',
  kinds: {
    external: true,
    file: true,
    heading: true,
    missing: true,
    preview: true,
  },
}

const stats: GraphFilterStats = {
  external: 2,
  file: 4,
  heading: 6,
  missing: 1,
  preview: 3,
}

const renderToolbar = (overrides: Partial<Parameters<typeof GraphToolbar>[0]> = {}) => {
  const onFiltersChange = vi.fn()

  render(
    <GraphToolbar
      edgeCount={8}
      filters={filters}
      hasActiveFilters={false}
      nodeCount={12}
      onFiltersChange={onFiltersChange}
      stats={stats}
      t={(key) => messages[key] ?? key}
      totalEdgeCount={10}
      totalNodeCount={14}
      {...overrides}
    />,
  )

  return { onFiltersChange }
}

describe('GraphToolbar', () => {
  it('labels the node kind filter group from i18n', () => {
    renderToolbar()

    expect(screen.getByRole('toolbar', { name: 'Graph node kind filters' })).toBeInTheDocument()
  })

  it('updates graph filters from the localized search input', () => {
    const { onFiltersChange } = renderToolbar()

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter graph...' }), {
      target: { value: 'diagram' },
    })

    expect(onFiltersChange).toHaveBeenCalledWith({
      ...filters,
      query: 'diagram',
    })
  })

  it('resets active graph filters to the default state', () => {
    const activeFilters: GraphFilterState = {
      query: 'diagram',
      kinds: {
        external: false,
        file: true,
        heading: true,
        missing: false,
        preview: true,
      },
    }
    const { onFiltersChange } = renderToolbar({
      filters: activeFilters,
      hasActiveFilters: true,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(onFiltersChange).toHaveBeenCalledWith(filters)
  })

  it('announces filter counts and pressed state for graph filter chips', () => {
    renderToolbar({
      filters: {
        ...filters,
        kinds: {
          ...filters.kinds,
          heading: false,
        },
      },
    })

    expect(screen.getByRole('button', { name: 'Files (4)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Headings (6)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
