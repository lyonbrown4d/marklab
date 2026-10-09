import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppCommandDialog from '@/components/AppCommandDialog'
import TitlebarCommandDialog from '@/components/TitlebarCommandDialog'

const fullText = vi.hoisted(() => ({
  fullTextError: false,
  fullTextFetching: false,
  fullTextResults: [],
  navigationCalls: [] as Array<{ activePath: string | null; query: string; scope: string }>,
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
vi.mock('@/components/titlebar/useWorkspaceNavigationQuery', () => ({
  useWorkspaceNavigationQuery: (options: {
    activePath: string | null
    query: string
    scope: string
  }) => {
    fullText.navigationCalls.push(options)
    return {
      headings: [{ label: 'Guide', level: 2, path: 'docs/Guide.md', slug: 'guide', text: 'Guide' }],
      navigationHeadings: [
        { level: 2, path: 'docs/current.md', slug: 'guide-navigation', text: 'Guide navigation' },
      ],
      navigationOutgoingLinks: [],
      navigationBacklinks: [],
      navigationMissingLinks: [],
      indexedFileCount: 1,
      workspaceIndexed: true,
      loading: false,
      error: false,
      retry: vi.fn(async () => undefined),
    }
  },
}))

const baseProps: ComponentProps<typeof TitlebarCommandDialog> = {
  open: true,
  activePath: 'docs/current.md',
  files: [{ label: 'Guide.md', path: 'docs/Guide.md' }],
  recentFiles: [{ label: 'Recent.md', path: 'docs/Recent.md' }],
  onOpenFile: vi.fn(),
  onOpenHeading: vi.fn(),
  onOpenSearchResult: vi.fn(),
  onOpenNavigationOutgoingLink: vi.fn(),
  onOpenNavigationBacklink: vi.fn(),
  onOpenNavigationMissingLink: vi.fn(),
  onAction: vi.fn(),
  canCreateWorkspaceEntries: true,
  searchIndexRebuilding: false,
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
  fullText.navigationCalls.length = 0
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

  it('drives bounded heading queries from the deferred dialog input', async () => {
    const input = await renderReadyDialog()
    fireEvent.change(input, { target: { value: '# architecture' } })

    await waitFor(() =>
      expect(fullText.navigationCalls.at(-1)).toMatchObject({
        activePath: 'docs/current.md',
        query: 'architecture',
        scope: 'headings',
      }),
    )
  })

  it('does not mount expensive content until workspace data is ready', () => {
    render(
      <AppCommandDialog open onOpenChange={vi.fn()}>
        <TitlebarCommandDialog {...baseProps} dataReady={false} />
      </AppCommandDialog>,
    )
    expect(screen.getByRole('combobox')).toBeVisible()
    expect(screen.queryByRole('tab', { name: 'command.mode.quickOpen' })).not.toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('tab', { name: 'command.mode.settings' }))
    expect(
      await screen.findByRole('heading', { name: 'command.emptyTitle.settings' }),
    ).toBeVisible()
  })

  it('searches settings only in the settings scope and opens the exact target', async () => {
    const onOpenSettingsSelection = vi.fn()
    render(
      <AppCommandDialog open onOpenChange={vi.fn()}>
        <TitlebarCommandDialog {...baseProps} onOpenSettingsSelection={onOpenSettingsSelection} />
      </AppCommandDialog>,
    )
    await screen.findByRole('tab', { name: 'command.mode.quickOpen' })
    const input = screen.getByRole('combobox')

    fireEvent.click(screen.getByRole('tab', { name: 'command.mode.settings' }))
    fireEvent.change(input, { target: { value: 'themePreset' } })

    fireEvent.click(await screen.findByRole('option', { name: /settings\.themePreset/ }))
    expect(onOpenSettingsSelection).toHaveBeenCalledWith({
      route: 'appearance',
      targetId: 'settings-theme',
    })
    expect(screen.queryByText('Guide')).not.toBeInTheDocument()
  })

  it('shows a selected command in the recent commands empty state', async () => {
    await renderReadyDialog()
    fireEvent.click(screen.getByRole('tab', { name: 'command.mode.commands' }))

    fireEvent.click(screen.getByRole('option', { name: /menu\.settings/ }))

    expect(screen.getByText('command.recentCommands')).toBeVisible()
    expect(screen.getAllByRole('option', { name: /menu\.settings/ }).length).toBeGreaterThan(1)
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
