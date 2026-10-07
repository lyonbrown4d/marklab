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
  'search.caseSensitive': 'Match case',
  'search.fullText': 'Full text search',
  'search.regex': 'Use regular expression',
  'search.wholeWord': 'Match whole word',
  'search.workspaceTitle': 'Workspace search',
  'sidebar.searchAction': 'Search',
}

const panelKeyDown = vi.hoisted(() => vi.fn(() => true))

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

vi.mock('@/components/FullTextSearchPanel', async () => {
  const React = await import('react')
  return {
    default: React.forwardRef(
      (
        {
          onOpenResult,
          options,
          query,
        }: {
          onOpenResult: (result: FsSearchResult) => void
          options: Record<string, boolean>
          query: string
        },
        ref: React.ForwardedRef<{ handleKeyDown: (key: string) => boolean }>,
      ) => {
        React.useImperativeHandle(ref, () => ({ handleKeyDown: panelKeyDown }))
        return (
          <section
            aria-label="Full text panel"
            data-options={JSON.stringify(options)}
            data-query={query}
          >
            <button onClick={() => onOpenResult(sampleResult as FsSearchResult)} type="button">
              Open full text result
            </button>
          </section>
        )
      },
    ),
  }
})

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

    const panel = screen.getByRole('region', { name: 'Workspace search' })
    expect(panel).toHaveAttribute('data-sidebar-panel', 'search')
    expect(panel).toHaveClass('p-0')
    expect(screen.getByRole('heading', { name: 'Workspace search' })).toHaveClass(
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

    expect(screen.getByRole('heading', { name: 'Workspace search' })).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: 'Full text search' })).toHaveAttribute(
      'placeholder',
      'Full text search',
    )
    expect(
      screen
        .getByRole('heading', { name: 'Workspace search' })
        .querySelector('[class~="size-3.5"]'),
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

  it('does not truncate ordinary queries at the regular-expression safety limit', () => {
    render(
      <SidebarSearchPanel
        focusWorkspaceSearchRequest={0}
        rootKind="external"
        rootPath="/workspace"
        onOpenSearchResult={vi.fn()}
      />,
    )

    const query = 'a'.repeat(140)
    const searchbox = screen.getByRole('searchbox', { name: 'Full text search' })
    expect(searchbox).not.toHaveAttribute('maxLength')

    fireEvent.change(searchbox, { target: { value: query } })
    expect(screen.getByLabelText('Full text panel')).toHaveAttribute('data-query', query)
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

  it('controls advanced options and delegates result navigation keys from the query field', () => {
    render(
      <SidebarSearchPanel
        focusWorkspaceSearchRequest={0}
        rootKind="external"
        rootPath="/workspace"
        onOpenSearchResult={vi.fn()}
      />,
    )

    const panel = screen.getByLabelText('Full text panel')
    expect(panel).toHaveAttribute(
      'data-options',
      JSON.stringify({ caseSensitive: false, wholeWord: false, useRegex: false }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Match case' }))
    fireEvent.click(screen.getByRole('button', { name: 'Match whole word' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use regular expression' }))
    expect(panel).toHaveAttribute(
      'data-options',
      JSON.stringify({ caseSensitive: true, wholeWord: true, useRegex: true }),
    )

    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Full text search' }), {
      key: 'ArrowDown',
    })
    expect(panelKeyDown).toHaveBeenCalledWith('ArrowDown')
  })
})
