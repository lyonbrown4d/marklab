import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TitlebarWorkspaceMenu } from '@/components/TitlebarWorkspaceMenu'
import { workspaceSyncApi } from '@/services/workspaceSyncApi'

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
  const onUseInternalRoot = vi.fn()
  return {
    onUseInternalRoot,
    ...render(
      <QueryClientProvider client={client}>
        <TitlebarWorkspaceMenu
          section="Notes"
          workspaceMenuLabel="Workspace"
          newWorkspaceLabel="New workspace"
          openFileLabel="Open file"
          newFileLabel="New file"
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
          localLibraryLabel="Local library"
          onNewWorkspace={vi.fn()}
          onOpenFile={vi.fn()}
          onCreateFile={vi.fn()}
          onOpenProject={vi.fn()}
          onOpenCurrentWorkspaceInNewWindow={vi.fn()}
          onSelectWorkspaceInNewWindow={vi.fn()}
          onUseInternalRoot={onUseInternalRoot}
          workspaceWindowOpening={false}
        />
      </QueryClientProvider>,
    ),
  }
}

describe('TitlebarWorkspaceMenu sync flow', () => {
  it('uses menu keyboard navigation, closes the menu, then opens and escapes the binding dialog', async () => {
    const user = userEvent.setup()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Workspace: Notes' })
    trigger.focus()

    await user.keyboard('{ArrowDown}')
    const configure = await screen.findByRole('menuitem', { name: /sync\.binding\.configure/ })
    await user.keyboard('{ArrowUp}')
    await waitFor(() => expect(configure).toHaveFocus())
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('dialog', { name: 'sync.binding.title' })).toBeInTheDocument()
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

  it('opens the built-in local library from the workspace menu', async () => {
    const user = userEvent.setup()
    const { onUseInternalRoot } = renderMenu()

    await user.click(screen.getByRole('button', { name: 'Workspace: Notes' }))
    await user.click(screen.getByRole('menuitem', { name: 'Local library' }))

    expect(onUseInternalRoot).toHaveBeenCalledOnce()
  })
})
