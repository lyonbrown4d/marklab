import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, PropsWithChildren } from 'react'
import AppStatusBar from '@/components/AppStatusBar'
import { useMarkdownAssetSyncStore } from '@/store/useMarkdownAssetSyncStore'
import { AppStatusBarProvider, EditorStatusBar } from '@/components/EditorStatusBar'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: { count?: string }) =>
      ({
        'statusBar.label': 'Status bar',
        'statusBar.openScm': 'Open Source Control',
        'statusBar.toggleTerminal': 'Toggle Terminal',
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
  isDesktopRuntime: () => false,
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
  onToggleTerminal: vi.fn(),
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
  localStorage.clear()
  useMarkdownAssetSyncStore.setState({ failed: 0, lastError: null, pending: 0 })
})

describe('AppStatusBar', () => {
  it('exposes icon-only status bar actions with accessible names', () => {
    const onToggleTerminal = vi.fn()
    renderStatusBar(createProps({ onToggleTerminal }))

    const statusBar = screen.getByRole('contentinfo', { name: 'Status bar' })

    expect(
      within(statusBar).getByRole('button', { name: 'Open Source Control' }),
    ).toBeInTheDocument()

    const terminalButton = within(statusBar).getByRole('button', { name: 'Toggle Terminal' })
    expect(terminalButton).toHaveAttribute('aria-pressed', 'false')
    expect(terminalButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

    fireEvent.click(terminalButton)

    expect(onToggleTerminal).toHaveBeenCalledTimes(1)
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
