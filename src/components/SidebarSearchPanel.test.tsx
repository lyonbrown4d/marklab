import { fireEvent, render, screen } from '@testing-library/react'
import { forwardRef, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import SidebarSearchPanel from '@/components/SidebarSearchPanel'
import type { FsSearchResult } from '@/services/fsApi'

const sampleResult = vi.hoisted(() => ({
  column: 1,
  end_column: 5,
  line: 9,
  path: 'docs/search.md',
  score: 0.7,
  snippet: 'search match',
  snippet_highlights: [{ end: 6, start: 0 }],
  title: 'Search result',
}))

const messages: Record<string, string> = {
  'search.fullText': 'Full text search',
  'sidebar.searchAction': 'Search',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

vi.mock('@/components/ui/input', () => ({
  Input: forwardRef<HTMLInputElement, ComponentProps<'input'>>((props, ref) => (
    <input ref={ref} {...props} />
  )),
}))

vi.mock('@/components/FullTextSearchPanel', () => ({
  default: ({
    onOpenResult,
    query,
  }: {
    onOpenResult: (result: FsSearchResult) => void
    query: string
  }) => (
    <section aria-label="Full text panel" data-query={query}>
      <button onClick={() => onOpenResult(sampleResult as FsSearchResult)} type="button">
        Open full text result
      </button>
    </section>
  ),
}))

describe('SidebarSearchPanel', () => {
  it('uses the shared flat sidebar panel structure', () => {
    render(
      <SidebarSearchPanel
        focusWorkspaceSearchRequest={0}
        rootKind="external"
        rootPath="/workspace"
        onOpenSearchResult={vi.fn()}
      />,
    )

    const panel = screen.getByRole('region', { name: 'Search' })
    expect(panel).toHaveAttribute('data-sidebar-panel', 'search')
    expect(panel).toHaveClass('p-0')
    expect(screen.getByRole('heading', { name: 'Search' })).toHaveClass(
      'h-8',
      'px-1',
      'text-xs',
      'font-medium',
    )
    expect(screen.getByRole('searchbox', { name: 'Full text search' })).toHaveClass(
      'focus-visible:ring-sidebar-ring/25',
    )
  })

  it('renders localized search chrome with normalized icon sizing', () => {
    render(
      <SidebarSearchPanel
        focusWorkspaceSearchRequest={0}
        rootKind="external"
        rootPath="/workspace"
        onOpenSearchResult={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Search' })).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: 'Full text search' })).toHaveAttribute(
      'placeholder',
      'Full text search',
    )
    expect(
      screen.getByRole('heading', { name: 'Search' }).querySelector('[class~="size-3.5"]'),
    ).not.toBeNull()
  })

  it('passes query changes to the full text panel and forwards selected results', () => {
    const onOpenSearchResult = vi.fn()

    render(
      <SidebarSearchPanel
        focusWorkspaceSearchRequest={0}
        rootKind="external"
        rootPath="/workspace"
        onOpenSearchResult={onOpenSearchResult}
      />,
    )

    fireEvent.change(screen.getByRole('searchbox', { name: 'Full text search' }), {
      target: { value: 'notes' },
    })

    expect(screen.getByLabelText('Full text panel')).toHaveAttribute('data-query', 'notes')

    fireEvent.click(screen.getByRole('button', { name: 'Open full text result' }))

    expect(onOpenSearchResult).toHaveBeenCalledWith(sampleResult)
  })

  it('focuses the full-text query when a new focus request arrives', () => {
    const props = {
      focusWorkspaceSearchRequest: 0,
      rootKind: 'external' as const,
      rootPath: '/workspace',
      onOpenSearchResult: vi.fn(),
    }
    const { rerender } = render(<SidebarSearchPanel {...props} />)

    expect(screen.getByRole('searchbox', { name: 'Full text search' })).not.toHaveFocus()
    rerender(<SidebarSearchPanel {...props} focusWorkspaceSearchRequest={1} />)

    expect(screen.getByRole('searchbox', { name: 'Full text search' })).toHaveFocus()
  })
})
