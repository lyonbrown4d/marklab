import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { forwardRef, type ComponentProps, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TitlebarCommandDialog from '@/components/TitlebarCommandDialog'
import type { FsSearchResult } from '@/services/fsApi'
import type { WorkspaceKnowledgeSummary } from '@/logic/knowledge'

const state = vi.hoisted(() => ({
  rememberSearch: vi.fn(),
  clearSearchHistory: vi.fn(),
  searches: ['recent query'],
  streamCalls: [] as { open: boolean; query: string; scope: string }[],
  result: {
    column: 2,
    end_column: 9,
    line: 4,
    path: 'docs/result.md',
    snippet: 'Matched content',
    snippet_highlights: [{ start: 0, end: 7 }],
    score: 1,
    title: 'Result title',
  },
}))

vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/AppCommandDialog', () => ({
  default: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}))
vi.mock('@/components/ui/command', () => ({
  CommandEmpty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandInput: forwardRef<
    HTMLInputElement,
    { value: string; onValueChange: (value: string) => void; placeholder: string }
  >(({ value, onValueChange, placeholder }, ref) => (
    <input
      ref={ref}
      aria-label="Command input"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  )),
}))
vi.mock('@/components/command/useCommandSearchHistory', () => ({
  useCommandSearchHistory: () => state,
}))
vi.mock('@/components/command/useCommandFullTextSearchStream', () => ({
  useCommandFullTextSearchStream: (options: (typeof state.streamCalls)[number]) => {
    state.streamCalls.push(options)
    return { fullTextResults: [state.result], fullTextFetching: false, fullTextError: null }
  },
}))
vi.mock('@/components/command/CommandSearchHistory', () => ({
  default: ({ onSelectSearch }: { onSelectSearch: (query: string) => void }) => (
    <button onClick={() => onSelectSearch('recent query')}>Pick history</button>
  ),
}))
vi.mock('@/components/command/CommandRecentFilesSection', () => ({
  default: ({ onOpenFile }: { onOpenFile: (path: string) => void }) => (
    <button onClick={() => onOpenFile('docs/recent.md')}>Open recent file</button>
  ),
}))
vi.mock('@/components/command/CommandNavigationSection', () => ({
  default: ({ onOpenHeading }: { onOpenHeading: (path: string, slug: string) => void }) => (
    <button onClick={() => onOpenHeading('docs/nav.md', 'intro')}>Open navigation heading</button>
  ),
}))
vi.mock('@/components/command/CommandSearchResults', () => ({
  default: ({
    query,
    scope,
    onOpenFile,
    onOpenHeading,
    onOpenSearchResult,
  }: {
    query: string
    scope: string
    onOpenFile: (path: string) => void
    onOpenHeading: (path: string, slug: string) => void
    onOpenSearchResult: (result: FsSearchResult) => void
  }) => (
    <section aria-label="Search results" data-query={query} data-scope={scope}>
      <button onClick={() => onOpenFile('docs/search.md')}>Open search file</button>
      <button onClick={() => onOpenHeading('docs/search.md', 'match')}>Open search heading</button>
      <button onClick={() => onOpenSearchResult(state.result)}>Open search result</button>
    </section>
  ),
}))
vi.mock('@/components/command/CommandActionSections', () => ({
  default: ({
    onCommandPaletteAction,
    onAction,
  }: {
    onCommandPaletteAction: () => void
    onAction: (id: string) => void
  }) => (
    <section aria-label="Actions">
      <button onClick={onCommandPaletteAction}>Return to search</button>
      <button onClick={() => onAction('settings.open')}>Open settings</button>
    </section>
  ),
}))

const renderDialog = (overrides: Partial<ComponentProps<typeof TitlebarCommandDialog>> = {}) => {
  const callbacks = {
    onOpenChange: vi.fn(),
    onOpenFile: vi.fn(),
    onOpenHeading: vi.fn(),
    onOpenSearchResult: vi.fn(),
    onOpenNavigationOutgoingLink: vi.fn(),
    onOpenNavigationBacklink: vi.fn(),
    onOpenNavigationMissingLink: vi.fn(),
    onAction: vi.fn(),
  }
  render(
    <TitlebarCommandDialog
      open
      activePath="docs/current.md"
      files={[{ path: 'docs/recent.md', label: 'Recent' }]}
      recentFiles={[{ path: 'docs/recent.md', label: 'Recent' }]}
      headings={[]}
      navigationHeadings={[]}
      navigationOutgoingLinks={[]}
      navigationBacklinks={[]}
      navigationMissingLinks={[]}
      canCreateWorkspaceEntries
      workspaceIndexed
      indexedFileCount={1}
      searchIndexRebuilding={false}
      knowledgeSummary={{} as WorkspaceKnowledgeSummary}
      collections={[]}
      {...callbacks}
      {...overrides}
    />,
  )
  return callbacks
}

const ready = () => screen.findByRole('button', { name: 'shortcuts.commandPalette' })
const input = () => screen.getByRole('textbox', { name: 'Command input' })

beforeEach(() => {
  state.streamCalls.length = 0
  state.rememberSearch.mockClear()
})

describe('TitlebarCommandDialog', () => {
  it('keeps its input mounted while content is deferred without starting a search', async () => {
    renderDialog()
    const initialInput = input()
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    await ready()
    expect(input()).toBe(initialInput)
    expect(state.streamCalls.every(({ open }) => !open)).toBe(true)
  })

  it('shows only recent content on entry, without duplicated results or all actions', async () => {
    const callbacks = renderDialog()
    await ready()
    expect(screen.getByRole('button', { name: 'Pick history' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Open recent file' }))
    expect(callbacks.onOpenFile).toHaveBeenCalledWith('docs/recent.md')
    expect(screen.queryByLabelText('Search results')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Actions')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Open navigation heading' }),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['@', 'scopeFiles', 'files'],
    ['#', 'scopeHeadings', 'headings'],
    ['?', 'scopeText', 'text'],
  ])(
    'selects the %s scope and returns keyboard focus to the input',
    async (marker, label, scope) => {
      renderDialog()
      await ready()
      fireEvent.click(
        screen.getAllByRole('button', { name: `${marker} command.search.${label}` })[0],
      )
      expect(input()).toHaveValue(`${marker} `)
      expect(input()).toHaveFocus()
      await waitFor(() =>
        expect(screen.getByLabelText('Search results')).toHaveAttribute('data-scope', scope),
      )
      expect(screen.queryByLabelText('Actions')).not.toBeInTheDocument()
    },
  )

  it('searches instead of repeating recent files and remembers selections', async () => {
    const callbacks = renderDialog()
    await ready()
    fireEvent.change(input(), { target: { value: 'guide' } })
    await waitFor(() =>
      expect(screen.getByLabelText('Search results')).toHaveAttribute('data-query', 'guide'),
    )
    expect(screen.queryByRole('button', { name: 'Open recent file' })).not.toBeInTheDocument()
    expect(state.streamCalls.at(-1)).toMatchObject({ open: true, query: 'guide' })
    fireEvent.click(screen.getByRole('button', { name: 'Open search file' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open search heading' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open search result' }))
    expect(state.rememberSearch).toHaveBeenCalledWith('guide')
    expect(callbacks.onOpenFile).toHaveBeenCalledWith('docs/search.md')
    expect(callbacks.onOpenHeading).toHaveBeenCalledWith('docs/search.md', 'match')
    expect(callbacks.onOpenSearchResult).toHaveBeenCalledWith(state.result)
  })

  it('opens explicit commands without full-text work and returns to recent content', async () => {
    const callbacks = renderDialog()
    fireEvent.click(await ready())
    expect(input()).toHaveFocus()
    fireEvent.change(input(), { target: { value: 'settings' } })
    expect(screen.queryByLabelText('Search results')).not.toBeInTheDocument()
    expect(state.streamCalls.every(({ open }) => !open)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(callbacks.onAction).toHaveBeenCalledWith('settings.open')
    fireEvent.click(screen.getByRole('button', { name: 'Return to search' }))
    expect(input()).toHaveValue('')
    expect(input()).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Open recent file' })).toBeVisible()
  })

  it('restores a history query and focuses the input', async () => {
    renderDialog()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Pick history' }))
    expect(input()).toHaveValue('recent query')
    expect(input()).toHaveFocus()
    await waitFor(() =>
      expect(screen.getByLabelText('Search results')).toHaveAttribute('data-query', 'recent query'),
    )
  })

  it('does not mount expensive content until workspace data is ready', () => {
    renderDialog({ dataReady: false })
    expect(input()).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'shortcuts.commandPalette' }),
    ).not.toBeInTheDocument()
    expect(state.streamCalls.every(({ open }) => !open)).toBe(true)
  })
})
