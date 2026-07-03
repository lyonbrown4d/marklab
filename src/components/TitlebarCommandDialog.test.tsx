import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ChangeEvent, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import TitlebarCommandDialog from '@/components/TitlebarCommandDialog'
import type { FsSearchResult } from '@/services/fsApi'
import type { WorkspaceKnowledgeSummary } from '@/logic/knowledge'

const historyState = vi.hoisted(() => ({
  clearSearchHistory: vi.fn(),
  rememberSearch: vi.fn(),
  searches: ['recent query'],
}))

const fullTextResult = vi.hoisted(() => ({
  column: 2,
  line: 4,
  path: 'docs/result.md',
  snippet: 'Matched content',
  title: 'Result title',
}))

const messages: Record<string, string> = {
  'command.empty.all': 'No matching commands or content.',
  'command.empty.files': 'No matching files.',
  'command.empty.headings': 'No matching headings.',
  'command.empty.text': 'No matching text.',
  'command.noResults': 'No command results',
  'command.searchHint': 'Type to search files, headings, and text.',
  'sidebar.search': 'Search workspace',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: { query?: string }) => {
      if (key === 'command.noResultsFor') return `No command results for ${values?.query ?? ''}`
      return messages[key] ?? key
    },
  }),
}))

vi.mock('@/components/AppCommandDialog', () => ({
  default: ({
    children,
    open,
  }: {
    children: ReactNode
    onOpenChange: (open: boolean) => void
    open: boolean
  }) => (
    <section aria-label="Command dialog" data-open={open ? 'true' : 'false'}>
      {children}
    </section>
  ),
}))

vi.mock('@/components/ui/command', () => ({
  CommandEmpty: ({ children }: { children: ReactNode }) => <div role="status">{children}</div>,
  CommandInput: ({
    onValueChange,
    placeholder,
    value,
  }: {
    onValueChange: (value: string) => void
    placeholder: string
    value: string
  }) => (
    <input
      aria-label="Command input"
      onChange={(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.currentTarget.value)}
      placeholder={placeholder}
      value={value}
    />
  ),
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/command/useCommandSearchHistory', () => ({
  useCommandSearchHistory: () => historyState,
}))

vi.mock('@/components/command/useCommandFullTextSearchStream', () => ({
  useCommandFullTextSearchStream: () => ({
    fullTextError: false,
    fullTextFetching: false,
    fullTextResults: [fullTextResult],
  }),
}))

vi.mock('@/components/command/CommandSearchOverview', () => ({
  default: ({
    filesCount,
    fullTextCount,
    headingsCount,
    query,
  }: {
    filesCount: number
    fullTextCount: number
    headingsCount: number
    query: string
  }) => (
    <div aria-label="Search overview">
      {query}|{filesCount}|{headingsCount}|{fullTextCount}
    </div>
  ),
}))

vi.mock('@/components/command/CommandSearchHistory', () => ({
  default: ({
    onClearSearches,
    onSelectSearch,
    searches,
  }: {
    onClearSearches: () => void
    onSelectSearch: (query: string) => void
    query: string
    searches: string[]
  }) => (
    <section aria-label="Search history">
      <button onClick={() => onSelectSearch(searches[0] ?? '')} type="button">
        Pick history
      </button>
      <button onClick={onClearSearches} type="button">
        Clear history
      </button>
    </section>
  ),
}))

vi.mock('@/components/command/CommandRecentFilesSection', () => ({
  default: ({ onOpenFile, query }: { onOpenFile: (path: string) => void; query: string }) => (
    <section aria-label="Recent files" data-query={query}>
      <button onClick={() => onOpenFile('docs/recent.md')} type="button">
        Open recent file
      </button>
    </section>
  ),
}))

vi.mock('@/components/command/CommandNavigationSection', () => ({
  default: ({ onOpenHeading }: { onOpenHeading: (path: string, slug: string) => void }) => (
    <section aria-label="Navigation">
      <button onClick={() => onOpenHeading('docs/nav.md', 'intro')} type="button">
        Open navigation heading
      </button>
    </section>
  ),
}))

vi.mock('@/components/command/CommandSearchResults', () => ({
  default: ({
    onOpenHeading,
    onOpenSearchResult,
    query,
    scope,
  }: {
    onOpenHeading: (path: string, slug: string) => void
    onOpenSearchResult: (result: FsSearchResult) => void
    query: string
    scope: string
  }) => (
    <section aria-label="Search results" data-query={query} data-scope={scope}>
      <button onClick={() => onOpenHeading('docs/search.md', 'match')} type="button">
        Open search heading
      </button>
      <button onClick={() => onOpenSearchResult(fullTextResult as FsSearchResult)} type="button">
        Open search result
      </button>
    </section>
  ),
}))

vi.mock('@/components/command/CommandActionSections', () => ({
  default: ({
    onAction,
    onCommandPaletteAction,
  }: {
    onAction: (id: string) => void
    onCommandPaletteAction: () => void
  }) => (
    <section aria-label="Actions">
      <button onClick={onCommandPaletteAction} type="button">
        Reset palette query
      </button>
      <button onClick={() => onAction('settings.open')} type="button">
        Open settings
      </button>
    </section>
  ),
}))

const createCallbacks = () => ({
  onAction: vi.fn(),
  onOpenChange: vi.fn(),
  onOpenFile: vi.fn(),
  onOpenHeading: vi.fn(),
  onOpenNavigationBacklink: vi.fn(),
  onOpenNavigationMissingLink: vi.fn(),
  onOpenNavigationOutgoingLink: vi.fn(),
  onOpenSearchResult: vi.fn(),
})

const renderDialog = () => {
  const callbacks = createCallbacks()

  render(
    <TitlebarCommandDialog
      activePath="docs/current.md"
      canCreateWorkspaceEntries
      collections={[]}
      files={[
        { label: 'One.md', path: 'docs/One.md' },
        { label: 'Two.md', path: 'docs/Two.md' },
      ]}
      headings={[{ label: 'One.md', level: 2, path: 'docs/One.md', slug: 'intro', text: 'Intro' }]}
      indexedFileCount={2}
      knowledgeSummary={{} as WorkspaceKnowledgeSummary}
      navigationBacklinks={[]}
      navigationHeadings={[]}
      navigationMissingLinks={[]}
      navigationOutgoingLinks={[]}
      open
      recentFiles={[{ label: 'Recent.md', path: 'docs/recent.md' }]}
      searchIndexRebuilding={false}
      workspaceIndexed
      {...callbacks}
    />,
  )

  return callbacks
}

describe('TitlebarCommandDialog', () => {
  it('renders the localized empty state and command overview', () => {
    renderDialog()

    expect(screen.getByRole('status')).toHaveTextContent('No command results')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Type to search files, headings, and text.',
    )
    expect(screen.getByRole('textbox', { name: 'Command input' })).toHaveAttribute(
      'placeholder',
      'Search workspace',
    )
    expect(screen.getByRole('status').querySelector('.size-5')).not.toBeNull()
    expect(screen.getByLabelText('Search overview')).toHaveTextContent('|2|1|1')
  })

  it('updates query-dependent empty copy and propagates query to command sections', async () => {
    renderDialog()

    fireEvent.change(screen.getByRole('textbox', { name: 'Command input' }), {
      target: { value: 'guide' },
    })

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('No command results for guide'),
    )
    expect(screen.getByRole('status')).toHaveTextContent('No matching commands or content.')
    expect(screen.getByLabelText('Recent files')).toHaveAttribute('data-query', 'guide')
    expect(screen.getByLabelText('Search results')).toHaveAttribute('data-query', 'guide')
    expect(screen.getByLabelText('Search results')).toHaveAttribute('data-scope', 'all')
  })

  it('remembers the active search before opening file or search-result entries', async () => {
    const callbacks = renderDialog()

    fireEvent.change(screen.getByRole('textbox', { name: 'Command input' }), {
      target: { value: 'guide' },
    })
    await waitFor(() =>
      expect(screen.getByLabelText('Recent files')).toHaveAttribute('data-query', 'guide'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open recent file' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open search heading' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open search result' }))

    expect(historyState.rememberSearch).toHaveBeenCalledWith('guide')
    expect(callbacks.onOpenFile).toHaveBeenCalledWith('docs/recent.md')
    expect(callbacks.onOpenHeading).toHaveBeenCalledWith('docs/search.md', 'match')
    expect(callbacks.onOpenSearchResult).toHaveBeenCalledWith(fullTextResult)
  })

  it('clears query through command palette action and forwards global actions', async () => {
    const callbacks = renderDialog()
    const input = screen.getByRole('textbox', { name: 'Command input' })

    fireEvent.change(input, { target: { value: 'guide' } })
    await waitFor(() => expect(input).toHaveValue('guide'))

    fireEvent.click(screen.getByRole('button', { name: 'Reset palette query' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))

    await waitFor(() => expect(input).toHaveValue(''))
    expect(callbacks.onAction).toHaveBeenCalledWith('settings.open')
  })
})
