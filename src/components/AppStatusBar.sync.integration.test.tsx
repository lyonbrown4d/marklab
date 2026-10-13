import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppStatusBar from '@/components/AppStatusBar'
import { workspaceSyncApi } from '@/services/workspaceSyncApi'
import { useNativeSurfaceOcclusionStore } from '@/app/nativeSurfaceOcclusion'

vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/gitApi', () => ({
  gitApi: { getStatus: vi.fn(async () => ({ repo: { is_repository: false } })) },
}))
vi.mock('@/components/AppStatusBarRight', () => ({ AppStatusBarRight: () => null }))
vi.mock('@/services/workspaceSyncApi', () => ({
  workspaceSyncApi: {
    getChannels: vi.fn(),
    listWebDavProfiles: vi.fn(async () => []),
    onProgress: vi.fn(() => vi.fn()),
    listConflicts: vi.fn(),
    readConflict: vi.fn(),
    resolveConflict: vi.fn(),
    setChannel: vi.fn(),
  },
}))

const createView = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const props = {
    rootKind: 'external' as const,
    rootPath: '/one',
    files: [],
    tabs: [],
    activeTab: null,
    activePath: null,
    viewMode: 'source' as const,
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
  const element = (rootPath: string) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppStatusBar {...props} rootPath={rootPath} />
      </MemoryRouter>
    </QueryClientProvider>
  )
  const view = render(element('/one'))
  return { ...view, changeRoot: (rootPath: string) => view.rerender(element(rootPath)) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(workspaceSyncApi.getChannels).mockResolvedValue({ webdav: null })
  vi.mocked(workspaceSyncApi.listConflicts).mockResolvedValue({ conflicts: [], binding: null })
})

describe('status bar sync action integration', () => {
  it('opens WebDAV setup directly and restores trigger focus on close', async () => {
    createView()
    const trigger = screen.getByRole('button', { name: 'sync.center.open' })
    await userEvent.click(trigger)
    const configure = await screen.findByRole('button', { name: 'sync.center.configure' })
    await waitFor(() => expect(configure).toBeEnabled())
    await userEvent.click(configure)
    expect(await screen.findByRole('dialog')).toHaveTextContent('sync.binding.title')
    expect(useNativeSurfaceOcclusionStore.getState().commandPaletteBlockers).toHaveProperty(
      'statusbar-sync-binding-dialog',
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('opens durable conflict comparison from a restarted workspace count', async () => {
    const binding = { profileId: 'cloud', remoteRoot: '/documents' }
    const conflict = {
      path: 'note.md',
      status: 'unresolved' as const,
      reason: 'both_changed' as const,
    }
    vi.mocked(workspaceSyncApi.getChannels).mockResolvedValue({
      webdav: { provider: 'webdav', ...binding, autoSync: false },
    })
    vi.mocked(workspaceSyncApi.listConflicts).mockResolvedValue({ conflicts: [conflict], binding })
    vi.mocked(workspaceSyncApi.readConflict).mockResolvedValue({
      conflict,
      local: { hash: 'a'.repeat(64), size: 4, text: 'local version', unavailable: null },
      savedRemote: { hash: 'b'.repeat(64), size: 5, text: 'remote version', unavailable: null },
    })
    createView()
    await userEvent.click(screen.getByRole('button', { name: 'sync.center.open' }))
    await userEvent.click(await screen.findByRole('button', { name: 'sync.center.conflicts' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('sync.conflicts.title')
    expect(await screen.findByText('local version')).toBeInTheDocument()
    expect(screen.getByText('remote version')).toBeInTheDocument()
    expect(useNativeSurfaceOcclusionStore.getState().commandPaletteBlockers).toHaveProperty(
      'workspace-sync-conflicts-dialog',
    )
  })

  it('closes configuration when the workspace root changes', async () => {
    const view = createView()
    await userEvent.click(screen.getByRole('button', { name: 'sync.center.open' }))
    const configure = await screen.findByRole('button', { name: 'sync.center.configure' })
    await waitFor(() => expect(configure).toBeEnabled())
    await userEvent.click(configure)
    await screen.findByRole('dialog')
    view.changeRoot('/two')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useNativeSurfaceOcclusionStore.getState().commandPaletteBlockers).not.toHaveProperty(
      'statusbar-sync-binding-dialog',
    )
    view.changeRoot('/one')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
