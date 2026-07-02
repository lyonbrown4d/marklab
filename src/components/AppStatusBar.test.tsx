import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, PropsWithChildren } from 'react'
import AppStatusBar from '@/components/AppStatusBar'
import i18n from '@/i18n/setup'
import { useMarkdownAssetSyncStore } from '@/store/useMarkdownAssetSyncStore'
import { usePreferencesStore } from '@/store/usePreferencesStore'

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

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

const renderStatusBar = (props: AppStatusBarProps) =>
  render(<AppStatusBar {...props} />, { wrapper: createWrapper() })

beforeEach(async () => {
  localStorage.clear()
  usePreferencesStore.setState({ locale: 'en-US' })
  useMarkdownAssetSyncStore.setState({ failed: 0, lastError: null, pending: 0 })
  await i18n.changeLanguage('en-US')
})

describe('AppStatusBar', () => {
  it('exposes icon-only status bar actions with accessible names', () => {
    const onToggleTerminal = vi.fn()
    renderStatusBar(createProps({ onToggleTerminal }))

    expect(screen.getByRole('button', { name: 'Open Source Control' })).toBeInTheDocument()

    const terminalButton = screen.getByRole('button', { name: 'Toggle Terminal' })
    expect(terminalButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(terminalButton)

    expect(onToggleTerminal).toHaveBeenCalledTimes(1)
  })
})
