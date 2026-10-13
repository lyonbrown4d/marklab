import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import AppStatusBar from '@/components/AppStatusBar'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { useVimModeStore, vimTabKey } from '@/store/useVimModeStore'

vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => false }))
vi.mock('@/components/AppStatusBarRight', () => ({ AppStatusBarRight: () => null }))
vi.mock('@/services/gitApi', () => ({ gitApi: { getStatus: vi.fn() } }))
vi.mock('@/services/workspaceSyncApi', () => ({
  workspaceSyncApi: {
    getChannels: vi.fn(async () => ({ webdav: null })),
    listWebDavProfiles: vi.fn(async () => []),
    onProgress: vi.fn(() => vi.fn()),
  },
}))

const props: ComponentProps<typeof AppStatusBar> = {
  rootKind: 'single',
  rootPath: 'C:/notes/README.md',
  files: [],
  tabs: [{ kind: 'file', path: 'README.md', view: 'edit' }],
  activeTab: { kind: 'file', path: 'README.md', view: 'edit' },
  activePath: 'README.md',
  viewMode: 'wysiwyg',
  dirtyPaths: {},
  saveStates: {},
  terminalOpen: false,
  readOnlyMode: false,
  restoreStatusMessage: null,
  restoreStatusBusy: false,
  onToggleTerminal: vi.fn(),
  onToggleReadOnly: vi.fn(),
  onOpenSettings: vi.fn(),
  onRestoreSession: vi.fn(),
}

beforeEach(() => {
  usePreferencesStore.setState({ vimModeEnabled: false })
  useVimModeStore.setState({ perTabOverrides: {} })
})

describe('bottom status bar Vim integration', () => {
  it('shows current-tab controls for file tabs and prunes closed overrides', () => {
    const workspaceKey = 'single:C:/notes/README.md'
    useVimModeStore.getState().setTabOverride(workspaceKey, 'file:edit:README.md', true)
    useVimModeStore.getState().setTabOverride(workspaceKey, 'file:edit:closed.md', true)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const element = (overrides: Partial<ComponentProps<typeof AppStatusBar>> = {}) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AppStatusBar {...props} {...overrides} />
        </MemoryRouter>
      </QueryClientProvider>
    )
    const { rerender } = render(element())
    expect(screen.getByTestId('vim-status-control')).toHaveTextContent('statusBar.vimSourceOnly')
    expect(useVimModeStore.getState().perTabOverrides).toEqual({
      [vimTabKey(workspaceKey, 'file:edit:README.md')]: true,
    })
    rerender(element({ viewMode: 'source' }))
    expect(screen.getByTestId('vim-status-control')).toHaveTextContent('statusBar.vimOn')
    rerender(element({ activeTab: null, activePath: null, tabs: [] }))
    expect(screen.queryByTestId('vim-status-control')).not.toBeInTheDocument()
    expect(useVimModeStore.getState().perTabOverrides).toEqual({})
  })
})
