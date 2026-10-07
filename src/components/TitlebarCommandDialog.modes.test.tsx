import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppCommandDialog from '@/components/AppCommandDialog'
import TitlebarCommandDialog from '@/components/TitlebarCommandDialog'

const fullText = vi.hoisted(() => ({
  fullTextError: false,
  fullTextFetching: false,
  fullTextResults: [],
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values?.query ? `${key}:${values.query}` : key,
  }),
}))

vi.mock('@/components/command/useCommandFullTextSearchStream', () => ({
  useCommandFullTextSearchStream: () => fullText,
}))

const baseProps: ComponentProps<typeof TitlebarCommandDialog> = {
  open: true,
  activePath: 'docs/current.md',
  files: [{ label: 'Guide.md', path: 'docs/Guide.md' }],
  recentFiles: [{ label: 'Recent.md', path: 'docs/Recent.md' }],
  headings: [{ label: 'Guide.md', level: 2, path: 'docs/Guide.md', slug: 'guide', text: 'Guide' }],
  navigationHeadings: [
    { level: 2, path: 'docs/current.md', slug: 'guide-navigation', text: 'Guide navigation' },
  ],
  navigationOutgoingLinks: [],
  navigationBacklinks: [],
  navigationMissingLinks: [],
  onOpenFile: vi.fn(),
  onOpenHeading: vi.fn(),
  onOpenSearchResult: vi.fn(),
  onOpenNavigationOutgoingLink: vi.fn(),
  onOpenNavigationBacklink: vi.fn(),
  onOpenNavigationMissingLink: vi.fn(),
  onAction: vi.fn(),
  canCreateWorkspaceEntries: true,
  workspaceIndexed: true,
  indexedFileCount: 1,
  searchIndexRebuilding: false,
  knowledgeSummary: {
    fileCount: 1,
    headingCount: 1,
    internalLinkCount: 0,
    linkedFileCount: 0,
    missingLinkCount: 0,
    orphanFileCount: 1,
  },
  collections: [],
  workspaceKey: 'external:/workspace',
}

const DialogHarness = () => {
  const [open, setOpen] = useState(true)
  return open ? (
    <AppCommandDialog open onOpenChange={setOpen}>
      <TitlebarCommandDialog {...baseProps} open />
    </AppCommandDialog>
  ) : (
    <p>Dialog closed</p>
  )
}

const renderReadyDialog = async () => {
  render(<DialogHarness />)
  await screen.findByRole('tab', { name: 'command.mode.quickOpen' })
  return screen.getByRole('combobox')
}

beforeEach(() => {
  localStorage.clear()
  fullText.fullTextError = false
  fullText.fullTextFetching = false
  fullText.fullTextResults = []
})

describe('TitlebarCommandDialog modes', () => {
  it('keeps navigation out of @ and # scoped quick-open results', async () => {
    const input = await renderReadyDialog()
    expect(screen.getByText('Guide navigation')).toBeVisible()

    fireEvent.change(input, { target: { value: '@ guide' } })
    expect(await screen.findByText('command.search.titleMatches')).toBeVisible()
    expect(screen.queryByText('Guide navigation')).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: '# guide' } })
    expect(await screen.findByText('command.headings')).toBeVisible()
    expect(screen.queryByText('Guide navigation')).not.toBeInTheDocument()
  })

  it('closes on Escape even when the query is not empty', async () => {
    const input = await renderReadyDialog()
    fireEvent.change(input, { target: { value: 'guide' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() => expect(screen.getByText('Dialog closed')).toBeVisible())
  })

  it('restores a full-text history entry into full-text mode', async () => {
    localStorage.setItem('marklab.command.searchHistory', JSON.stringify(['? deep search']))
    const input = await renderReadyDialog()

    fireEvent.click(screen.getByRole('option', { name: '? deep search' }))

    expect(input).toHaveValue('? deep search')
    expect(screen.getByRole('tab', { name: 'command.mode.fullText' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('exposes a labelled tabpanel and mode-specific empty states', async () => {
    const input = await renderReadyDialog()
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', 'command-mode-tab-quick-open')

    fireEvent.change(input, { target: { value: 'no-quick-match' } })
    expect(
      await screen.findByRole('heading', { name: 'command.emptyTitle.quickOpen' }),
    ).toBeVisible()

    fireEvent.click(screen.getByRole('tab', { name: 'command.mode.fullText' }))
    expect(
      await screen.findByRole('heading', { name: 'command.emptyTitle.fullText' }),
    ).toBeVisible()

    fireEvent.click(screen.getByRole('tab', { name: 'command.mode.commands' }))
    expect(
      await screen.findByRole('heading', { name: 'command.emptyTitle.commands' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '@ command.search.scopeFiles' }),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['fetching', { fullTextFetching: true, fullTextError: false }, 'status'],
    ['failed', { fullTextFetching: false, fullTextError: true }, 'alert'],
  ])('does not show an empty result alongside a %s full-text state', async (_name, state, role) => {
    Object.assign(fullText, state)
    const input = await renderReadyDialog()
    fireEvent.click(screen.getByRole('tab', { name: 'command.mode.fullText' }))
    fireEvent.change(input, { target: { value: 'no-full-text-match' } })

    expect(await screen.findByRole(role)).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'command.emptyTitle.fullText' }),
    ).not.toBeInTheDocument()
  })
})
