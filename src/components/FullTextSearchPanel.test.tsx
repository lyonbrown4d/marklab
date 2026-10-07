import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef, type ReactNode, type RefObject } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FullTextSearchPanel, {
  type FullTextSearchPanelHandle,
} from '@/components/FullTextSearchPanel'
import type { WorkspaceSearchOptions } from '@/components/sidebar-search/searchModel'
import { fsApi, type FsSearchResult } from '@/services/fsApi'

const messages: Record<string, string> = {
  'actions.retry': 'Retry',
  'search.cancel': 'Cancel',
  'search.canceled': 'Search canceled',
  'search.collapseAll': 'Collapse all',
  'search.expandAll': 'Expand all',
  'search.failed': 'Search failed',
  'search.footer.collapse': 'Esc collapse',
  'search.footer.navigate': 'Up/down navigate',
  'search.footer.open': 'Enter open',
  'search.invalidRegex': 'Invalid regular expression',
  'search.line': 'Line number {{line}}',
  'search.matches': '{{count}} search hits',
  'search.minQuery': 'Type at least 2 characters',
  'search.noResults': 'No results',
  'search.regexNeedsLiteral': 'Regex needs a literal fragment',
  'search.regexTooLong': 'Regular expression is too long',
  'search.resultSummary': '{{matches}} results in {{files}} files',
  'search.searching': 'Searching',
  'search.unsafeRegex': 'Unsafe regular expression',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, number>) =>
      (messages[key] ?? key).replace(/{{(\w+)}}/g, (_, name: string) =>
        String(values?.[name] ?? ''),
      ),
  }),
}))

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/fsApi', () => ({
  fsApi: {
    cancelWorkspaceOccurrenceSearch: vi.fn().mockResolvedValue({ cancelled: true }),
    searchWorkspaceOccurrences: vi.fn(),
  },
}))
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}))

const options: WorkspaceSearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
}

const result = (path: string, line: number, snippet: string): FsSearchResult => ({
  column: 1,
  end_column: 5,
  line,
  path,
  score: 1,
  snippet,
  snippet_highlights: [{ end: 5, start: 0 }],
  title: path.split('/').at(-1) ?? path,
})

const response = (results: FsSearchResult[]) => ({
  requestId: 'response-request',
  results,
  scannedDocuments: 3,
  totalHits: results.length,
  truncated: false,
})

const renderPanel = ({
  onOpenResult = vi.fn(),
  panelRef,
  query = 'notes',
}: {
  onOpenResult?: (value: FsSearchResult) => void
  panelRef?: RefObject<FullTextSearchPanelHandle | null>
  query?: string
} = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let searchInput: HTMLInputElement | null = null
  return render(
    <QueryClientProvider client={client}>
      <input
        ref={(node) => {
          searchInput = node
        }}
        aria-label="Query focus target"
      />
      <FullTextSearchPanel
        ref={panelRef}
        onOpenResult={onOpenResult}
        onRequestSearchFocus={() => searchInput?.focus()}
        options={options}
        query={query}
        workspaceKey="external:/workspace-a"
      />
    </QueryClientProvider>,
  )
}

describe('FullTextSearchPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('announces loading and lets the user cancel the visible request', async () => {
    vi.mocked(fsApi.searchWorkspaceOccurrences).mockReturnValue(new Promise(() => undefined))
    const { container } = renderPanel()

    await waitFor(() =>
      expect(fsApi.searchWorkspaceOccurrences).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
          options,
          query: 'notes',
          requestId: expect.any(String),
        }),
      ),
    )
    expect(screen.getByRole('status', { name: 'Searching' })).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelectorAll('[data-slot="full-text-search-skeleton"]')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Search canceled')).toBeInTheDocument()
    const request = vi.mocked(fsApi.searchWorkspaceOccurrences).mock.calls[0]?.[0]
    await waitFor(() =>
      expect(fsApi.cancelWorkspaceOccurrenceSearch).toHaveBeenCalledWith(request?.requestId),
    )
  })

  it('cancels in-flight backend work when the query changes and when the panel unmounts', async () => {
    vi.mocked(fsApi.searchWorkspaceOccurrences).mockReturnValue(new Promise(() => undefined))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const panel = (query: string) => (
      <QueryClientProvider client={client}>
        <FullTextSearchPanel
          onOpenResult={vi.fn()}
          options={options}
          query={query}
          workspaceKey="external:/workspace-a"
        />
      </QueryClientProvider>
    )
    const rendered = render(panel('notes'))
    await waitFor(() => expect(fsApi.searchWorkspaceOccurrences).toHaveBeenCalledTimes(1))
    const firstRequest = vi.mocked(fsApi.searchWorkspaceOccurrences).mock.calls[0]?.[0]

    rendered.rerender(panel('updated'))
    await waitFor(() =>
      expect(fsApi.cancelWorkspaceOccurrenceSearch).toHaveBeenCalledWith(firstRequest?.requestId),
    )
    await waitFor(() => expect(fsApi.searchWorkspaceOccurrences).toHaveBeenCalledTimes(2))
    const secondRequest = vi.mocked(fsApi.searchWorkspaceOccurrences).mock.calls[1]?.[0]

    rendered.unmount()
    await waitFor(() =>
      expect(fsApi.cancelWorkspaceOccurrenceSearch).toHaveBeenCalledWith(secondRequest?.requestId),
    )
  })

  it('shows a retry action when indexed search fails', async () => {
    vi.mocked(fsApi.searchWorkspaceOccurrences)
      .mockRejectedValueOnce(new Error('sidecar failed'))
      .mockResolvedValueOnce(response([]))
    renderPanel()

    expect(await screen.findByRole('heading', { name: 'Search failed' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(fsApi.searchWorkspaceOccurrences).toHaveBeenCalledTimes(2))
  })

  it('groups matches by file and supports group and bulk disclosure controls', async () => {
    vi.mocked(fsApi.searchWorkspaceOccurrences).mockResolvedValue(
      response([
        result('docs/guide.md', 4, 'notes alpha'),
        result('docs/guide.md', 12, 'notes beta'),
        result('ideas.md', 7, 'notes gamma'),
      ]),
    )
    renderPanel()

    expect(await screen.findByText('3 results in 2 files')).toBeInTheDocument()
    const guide = screen.getByRole('button', { name: 'guide.md, 2 search hits' })
    expect(guide).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /line number 12/i })).toBeInTheDocument()

    fireEvent.click(guide)
    expect(screen.queryByRole('button', { name: /line number 12/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(screen.queryByRole('button', { name: /line number 7/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(screen.getByRole('button', { name: /line number 7/i })).toBeInTheDocument()
  })

  it('moves the selected match with arrows and opens it with Enter', async () => {
    const panelRef = createRef<FullTextSearchPanelHandle>()
    const onOpenResult = vi.fn()
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    vi.mocked(fsApi.searchWorkspaceOccurrences).mockResolvedValue(
      response([result('guide.md', 4, 'notes alpha'), result('guide.md', 12, 'notes beta')]),
    )
    renderPanel({ onOpenResult, panelRef })

    const first = await screen.findByRole('button', { name: /line number 4/i })
    const second = screen.getByRole('button', { name: /line number 12/i })
    expect(first).toHaveAttribute('aria-current', 'true')

    scrollIntoView.mockClear()
    first.focus()
    act(() => expect(panelRef.current?.handleKeyDown('ArrowDown')).toBe(true))
    expect(second).toHaveAttribute('aria-current', 'true')
    expect(second).toHaveFocus()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }))
    act(() => expect(panelRef.current?.handleKeyDown('Escape')).toBe(true))
    expect(screen.getByRole('textbox', { name: 'Query focus target' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: /line number 12/i })).not.toBeInTheDocument()
    expect(panelRef.current?.handleKeyDown('Enter')).toBe(false)
    expect(onOpenResult).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(screen.getByRole('button', { name: /line number 12/i })).toHaveAttribute(
      'aria-current',
      'true',
    )
    act(() => expect(panelRef.current?.handleKeyDown('Enter')).toBe(true))
    expect(onOpenResult).toHaveBeenCalledWith(expect.objectContaining({ line: 12 }))
  })

  it('renders minimum-query, overlong-regex, and empty states without searching', async () => {
    const { rerender } = renderPanel({ query: 'a' })
    expect(screen.getByRole('heading', { name: 'Type at least 2 characters' })).toBeInTheDocument()

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    rerender(
      <QueryClientProvider client={client}>
        <FullTextSearchPanel
          onOpenResult={vi.fn()}
          options={{ ...options, useRegex: true }}
          query={'a'.repeat(121)}
          workspaceKey="external:/workspace-a"
        />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Regular expression is too long')
    expect(fsApi.searchWorkspaceOccurrences).not.toHaveBeenCalled()

    vi.mocked(fsApi.searchWorkspaceOccurrences).mockResolvedValue(response([]))
    rerender(
      <QueryClientProvider client={client}>
        <FullTextSearchPanel
          onOpenResult={vi.fn()}
          options={options}
          query="missing"
          workspaceKey="external:/workspace-a"
        />
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'No results' })).toBeInTheDocument()
  })
})
