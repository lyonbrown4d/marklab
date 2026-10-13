import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TitlebarWorkspaceMenu } from '@/components/TitlebarWorkspaceMenu'
import { workspaceSyncApi } from '@/services/workspaceSyncApi'
import { recentWorkspaceApi } from '@/services/recentWorkspaceApi'

vi.mock('@/services/recentWorkspaceApi', () => ({
  recentWorkspaceApi: {
    isAvailable: vi.fn(() => false),
    list: vi.fn(),
    remove: vi.fn(),
    watch: vi.fn(async () => () => undefined),
  },
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/services/workspaceSyncApi', () => ({
  workspaceSyncApi: {
    getChannels: vi.fn(),
    listWebDavProfiles: vi.fn(),
    setChannel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

const renderMenu = () => {
  vi.mocked(workspaceSyncApi.getChannels).mockResolvedValue({ webdav: null })
  vi.mocked(workspaceSyncApi.listWebDavProfiles).mockResolvedValue([
    {
      id: 'cloud',
      label: 'Home cloud',
      endpoint: 'https://dav.example.com',
      basePath: '/',
      username: 'ada',
      allowInsecureLocal: false,
      sessionOnly: false,
      hasPassword: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TitlebarWorkspaceMenu
        section="Notes"
        workspaceMenuLabel="Workspace"
        newWorkspaceLabel="New workspace"
        openFileLabel="Open file"
        newFileLabel="New file"
        exportWorkspaceLabel="Export workspace"
        recentWorkspaces={{
          currentLabel: 'Current',
          emptyLabel: 'Empty',
          openLabel: 'Open {name}',
          paths: [],
          rootKind: 'external',
          rootPath: 'C:/notes',
          sectionLabel: 'Recent',
        }}
        openCurrentWorkspaceInNewWindowLabel="Open current in new window"
        openWorkspaceInNewWindowLabel="Open workspace in new window"
        onNewWorkspace={vi.fn()}
        onOpenFile={vi.fn()}
        onCreateFile={vi.fn()}
        onExportWorkspace={vi.fn()}
        onOpenProject={vi.fn()}
        onOpenCurrentWorkspaceInNewWindow={vi.fn()}
        onSelectWorkspaceInNewWindow={vi.fn()}
        workspaceWindowOpening={false}
      />
    </QueryClientProvider>,
  )
}

describe('TitlebarWorkspaceMenu sync flow', () => {
  beforeEach(() => vi.mocked(recentWorkspaceApi.isAvailable).mockReturnValue(false))

  it('closes the workspace menu and returns focus after removing a history entry', async () => {
    vi.mocked(recentWorkspaceApi.isAvailable).mockReturnValue(true)
    vi.mocked(recentWorkspaceApi.list).mockResolvedValue([
      { path: 'C:/notes', status: 'available' },
    ])
    vi.mocked(recentWorkspaceApi.remove).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Workspace: Notes' })
    await user.click(trigger)
    await user.click(await screen.findByRole('menuitem', { name: 'workspace.removeHistory' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(recentWorkspaceApi.remove).toHaveBeenCalledWith('C:/notes')
  })

  it('uses menu keyboard navigation, closes the menu, then opens and escapes the binding dialog', async () => {
    const user = userEvent.setup()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Workspace: Notes' })
    trigger.focus()

    await user.keyboard('{ArrowDown}')
    const configure = await screen.findByRole('menuitem', { name: /sync\.binding\.configure/ })
    const menuItems = await screen.findAllByRole('menuitem')
    for (
      let index = 0;
      index < menuItems.length && document.activeElement !== configure;
      index += 1
    ) {
      await user.keyboard('{ArrowDown}')
    }
    await waitFor(() => expect(configure).toHaveFocus())
    await user.keyboard('{Enter}')

    await screen.findByRole('dialog', { name: 'sync.binding.title' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'sync.binding.title' })).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('keeps a failed WebDAV binding mutation visible in the active dialog', async () => {
    const user = userEvent.setup()
    vi.mocked(workspaceSyncApi.setChannel).mockRejectedValueOnce(new Error('strict IPC rejected'))
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Workspace: Notes' }))
    await user.click(await screen.findByRole('menuitem', { name: /sync\.binding\.configure/ }))
    await screen.findByRole('dialog', { name: 'sync.binding.title' })
    await user.click(screen.getByRole('button', { name: 'sync.binding.bind' }))

    const alert = await screen.findByRole('alert')
    expect(screen.getByRole('dialog', { name: 'sync.binding.title' })).toContainElement(alert)
    expect(alert).toHaveTextContent('sync.menu.updateFailed')
  })

  it('handles the workspace menu being unmounted while a dialog restores focus', async () => {
    const user = userEvent.setup()
    const { unmount } = renderMenu()
    const trigger = screen.getByRole('button', { name: 'Workspace: Notes' })
    await user.click(trigger)
    await user.click(await screen.findByRole('menuitem', { name: /sync\.binding\.configure/ }))
    await screen.findByRole('dialog', { name: 'sync.binding.title' })
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    unmount()
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    expect(trigger).not.toBeInTheDocument()
  })

  it('does not expose the built-in local library from the workspace menu', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Workspace: Notes' }))

    expect(screen.queryByRole('menuitem', { name: 'Local library' })).not.toBeInTheDocument()
  })
})
