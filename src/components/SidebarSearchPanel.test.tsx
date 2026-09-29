import { fireEvent, render, screen } from '@testing-library/react'
import { forwardRef, type ChangeEvent, type ReactNode } from 'react'
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
  Input: forwardRef<
    HTMLInputElement,
    {
      className?: string
      onChange: (event: ChangeEvent<HTMLInputElement>) => void
      placeholder?: string
      value: string
    }
  >(({ className, onChange, placeholder, value }, ref) => (
    <input
      ref={ref}
      aria-label="Search input"
      className={className}
      onChange={onChange}
      placeholder={placeholder}
      value={value}
    />
  )),
}))

vi.mock('@/components/ui/sidebar', () => ({
  SidebarGroup: ({ children, className }: { children: ReactNode; className?: string }) => (
    <section className={className}>{children}</section>
  ),
  SidebarGroupContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  SidebarGroupLabel: ({ children, className }: { children: ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
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
    expect(screen.getByRole('textbox', { name: 'Search input' })).toHaveAttribute(
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

    fireEvent.change(screen.getByRole('textbox', { name: 'Search input' }), {
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

    expect(screen.getByRole('textbox', { name: 'Search input' })).not.toHaveFocus()
    rerender(<SidebarSearchPanel {...props} focusWorkspaceSearchRequest={1} />)

    expect(screen.getByRole('textbox', { name: 'Search input' })).toHaveFocus()
  })
})
