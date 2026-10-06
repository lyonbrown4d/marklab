import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, PropsWithChildren } from 'react'
import AppStatusBar from '@/components/AppStatusBar'
import { useMarkdownAssetSyncStore } from '@/store/useMarkdownAssetSyncStore'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { AppStatusBarProvider, EditorStatusBar } from '@/components/EditorStatusBar'
import { isDesktopRuntime } from '@/runtime/environment'
import { gitApi } from '@/services/gitApi'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: { count?: string }) =>
      ({
        'statusBar.label': 'Status bar',
        'statusBar.openScm': 'Open Source Control',
        'statusBar.toggleTerminal': 'Toggle Terminal',
        'statusBar.readOnlyEditable': 'Editable',
        'statusBar.readOnlyLocked': 'Read-only',
        'statusBar.enableReadOnly': 'Enter read-only browsing',
        'statusBar.disableReadOnly': 'Resume editing',
        'statusBar.hide': 'Hide status bar',
        'statusBar.unsavedFiles': `${values?.count} unsaved files`,
        'save.saving': 'Saving',
        'save.saved': 'Saved',
        'save.error': 'Save failed',
        'app.restoreRetry': 'Retry restore',
      })[key] ?? key,
  }),
}))

vi.mock('@/components/StatusCenter', () => ({
  default: () => <button type="button">Task center</button>,
}))

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: vi.fn(() => false),
}))

vi.mock('@/services/gitApi', () => ({
  gitApi: { getStatus: vi.fn() },
}))

vi.mock('@/services/workspaceSyncApi', () => ({
  workspaceSyncApi: {
    getChannels: vi.fn(async () => ({ webdav: null })),
    listWebDavProfiles: vi.fn(async () => []),
    onProgress: vi.fn(() => vi.fn()),
  },
}))

type AppStatusBarProps = ComponentProps<typeof AppStatusBar>

const createProps = (overrides: Partial<AppStatusBarProps> = {}): AppStatusBarProps => ({
  rootKind: 'single',
  rootPath: 'C:/notes/README.md',
  files: [{ kind: 'file', path: 'README.md' }],
  tabs: [{ kind: 'file', path: 'README.md', view: 'edit' }],
  activeTab: { kind: 'file', path: 'README.md', view: 'edit' },
  activePath: 'README.md',
  viewMode: 'wysiwyg',
  dirtyPaths: {},
  saveStates: {},
  terminalOpen: false,
  readOnlyMode: false,
  onToggleTerminal: vi.fn(),
  onToggleReadOnly: vi.fn(),
  onRestoreSession: vi.fn(),
  restoreStatusMessage: null,
  restoreStatusBusy: false,
  ...overrides,
})

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const Wrapper = ({ children }: PropsWithChildren) => {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
  return Wrapper
}

const renderStatusBar = (props: AppStatusBarProps) =>
  render(<AppStatusBar {...props} />, { wrapper: createWrapper() })

beforeEach(() => {
  vi.mocked(isDesktopRuntime).mockReturnValue(false)
  vi.mocked(gitApi.getStatus).mockResolvedValue({
    repo: { is_repository: false },
    staged: [],
    unstaged: [],
    untracked: [],
    conflicts: [],
  })
  localStorage.clear()
  useMarkdownAssetSyncStore.setState({ failed: 0, lastError: null, pending: 0 })
  usePreferencesStore.setState({ sidebarCollapsed: true })
})

describe('AppStatusBar', () => {
  it('loads Git status through the standalone SCM API', async () => {
    vi.mocked(isDesktopRuntime).mockReturnValue(true)

    renderStatusBar(createProps({ rootKind: 'external', rootPath: 'C:/notes' }))

    await waitFor(() => expect(gitApi.getStatus).toHaveBeenCalledWith('C:/notes'))
  })

  it('exposes icon-only status bar actions with accessible names', () => {
    const onToggleTerminal = vi.fn()
    const onToggleReadOnly = vi.fn()
    renderStatusBar(createProps({ onToggleReadOnly, onToggleTerminal }))

    const statusBar = screen.getByRole('contentinfo', { name: 'Status bar' })

    expect(
      within(statusBar).getByRole('button', { name: 'Open Source Control' }),
    ).toBeInTheDocument()

    const terminalButton = within(statusBar).getByRole('button', { name: 'Toggle Terminal' })
    expect(terminalButton).toHaveAttribute('aria-pressed', 'false')
    expect(terminalButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

    fireEvent.click(terminalButton)
    const readOnlyButton = within(statusBar).getByRole('button', {
      name: 'Enter read-only browsing',
    })
    expect(readOnlyButton).toHaveAttribute('aria-pressed', 'false')
    expect(readOnlyButton).toHaveAttribute('data-read-only', 'false')
    expect(readOnlyButton).toHaveTextContent('Editable')
    expect(readOnlyButton.querySelector('[data-icon="read-only-unlocked"]')).toBeInTheDocument()
    fireEvent.click(readOnlyButton)

    expect(onToggleTerminal).toHaveBeenCalledTimes(1)
    expect(onToggleReadOnly).toHaveBeenCalledTimes(1)
  })

  it('opens the workspace drawer when source control is requested', () => {
    renderStatusBar(createProps())

    fireEvent.click(screen.getByRole('button', { name: 'Open Source Control' }))

    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(false)
  })

  it('makes read-only browsing visibly locked and keeps the escape action available', () => {
    renderStatusBar(createProps({ readOnlyMode: true }))

    const readOnlyButton = screen.getByRole('button', { name: 'Resume editing' })

    expect(readOnlyButton).toHaveAttribute('aria-pressed', 'true')
    expect(readOnlyButton).toHaveAttribute('data-read-only', 'true')
    expect(readOnlyButton).toHaveTextContent('Read-only')
    expect(readOnlyButton.querySelector('[data-icon="read-only-locked"]')).toBeInTheDocument()
    expect(readOnlyButton).toBeEnabled()
  })

  it('allows leaving read-only mode even after the active file is cleared', () => {
    const onToggleReadOnly = vi.fn()
    renderStatusBar(createProps({ activePath: null, readOnlyMode: true, onToggleReadOnly }))

    const readOnlyButton = screen.getByRole('button', { name: 'Resume editing' })
    expect(readOnlyButton).toBeEnabled()

    fireEvent.click(readOnlyButton)
    expect(onToggleReadOnly).toHaveBeenCalledTimes(1)
  })

  it('announces save changes without repeating the active path as visible text', () => {
    renderStatusBar(
      createProps({
        dirtyPaths: { 'README.md': true },
        saveStates: { 'README.md': { status: 'saving' } },
      }),
    )

    const statusBar = screen.getByRole('contentinfo', { name: 'Status bar' })
    const liveRegion = statusBar.querySelector('[aria-live="polite"]')

    expect(liveRegion).toHaveTextContent('1 unsaved files')
    expect(liveRegion).toHaveTextContent('Saving')
    expect(within(statusBar).queryByText('README.md')).not.toBeInTheDocument()
    expect(within(statusBar).getByText('Saving')).toHaveAttribute('title', 'README.md')
    expect(within(statusBar).getByRole('button', { name: 'Task center' })).toBeInTheDocument()
  })

  it('prioritizes unsaved work while marking verbose activity as secondary', () => {
    useMarkdownAssetSyncStore.setState({ failed: 0, lastError: null, pending: 2 })
    renderStatusBar(
      createProps({
        dirtyPaths: { 'README.md': true },
        saveStates: { 'README.md': { status: 'saving' } },
      }),
    )

    expect(screen.getByText('1 unsaved files')).toHaveAttribute('data-status-priority', 'primary')
    expect(screen.getByLabelText('1 unsaved files')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '1 unsaved files' })).toBeInTheDocument()
    expect(screen.getByText('Saving')).toHaveAttribute('data-status-priority', 'secondary')
    expect(screen.getByText('statusBar.assetsSyncing')).toHaveAttribute(
      'data-status-priority',
      'secondary',
    )
    expect(screen.getByRole('button', { name: 'Enter read-only browsing' })).toHaveAttribute(
      'data-status-priority',
      'primary',
    )
  })

  it('keeps save and asset failures visible at narrow widths', () => {
    useMarkdownAssetSyncStore.setState({
      failed: 1,
      lastError: 'Could not copy image',
      pending: 0,
    })
    renderStatusBar(
      createProps({
        saveStates: { 'README.md': { status: 'error' } },
      }),
    )

    expect(screen.getByText('Save failed')).toHaveAttribute('data-status-priority', 'primary')
    expect(screen.getByLabelText('Save failed')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Save failed' })).toBeInTheDocument()
    expect(screen.getByText('statusBar.assetsFailed')).toHaveAttribute(
      'data-status-priority',
      'primary',
    )
    expect(screen.getByLabelText('statusBar.assetsFailed')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'statusBar.assetsFailed' })).toBeInTheDocument()
  })

  it('uses the shared spinner for busy restore actions without renaming the button', () => {
    renderStatusBar(
      createProps({
        restoreStatusBusy: true,
        restoreStatusMessage: 'Could not restore workspace session',
      }),
    )

    const restoreButton = screen.getByRole('button', { name: 'Retry restore' })
    const spinner = restoreButton.querySelector('svg[role="presentation"]')

    expect(restoreButton).toBeDisabled()
    expect(spinner).toHaveAttribute('aria-hidden', 'true')
    expect(spinner).toHaveAttribute('data-icon', 'inline-start')
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
  })

  it('does not render decorative separators', () => {
    renderStatusBar(createProps())

    const statusBar = screen.getByRole('contentinfo', { name: 'Status bar' })
    const separators = statusBar.querySelectorAll('[data-orientation="vertical"]')

    expect(separators).toHaveLength(0)
    expect(within(statusBar).queryByRole('separator')).not.toBeInTheDocument()
  })

  it('hosts document information in the only footer', () => {
    renderStatusBarComposition(true)
    const footer = screen.getByRole('contentinfo', { name: 'Status bar' })
    expect(within(footer).getByText('42 words')).toBeInTheDocument()
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1)
  })

  it('keeps tasks and save errors when document status is disabled', () => {
    renderStatusBarComposition(false)
    expect(screen.queryByText('42 words')).not.toBeInTheDocument()
    expect(screen.getByText('Save failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Task center' })).toBeInTheDocument()
  })
})

const renderStatusBarComposition = (showStatusBar: boolean) =>
  render(
    <AppStatusBarProvider activePath="README.md" viewMode="wysiwyg">
      <main>
        {showStatusBar && (
          <EditorStatusBar activePath="README.md" viewMode="wysiwyg">
            42 words
          </EditorStatusBar>
        )}
      </main>
      <AppStatusBar {...createProps({ saveStates: { 'README.md': { status: 'error' } } })} />
    </AppStatusBarProvider>,
    { wrapper: createWrapper() },
  )
