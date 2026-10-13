import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RecentWorkspaceMenuSection } from '@/components/titlebar/RecentWorkspaceMenuSection'
import { recentWorkspaceApi } from '@/services/recentWorkspaceApi'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import type { RecentWorkspace } from '@/types/recentWorkspaces'

vi.mock('@/services/recentWorkspaceApi', () => ({
  recentWorkspaceApi: {
    isAvailable: vi.fn(() => true),
    list: vi.fn(),
    remove: vi.fn(),
    watch: vi.fn(async () => () => undefined),
  },
}))
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: { name: string }) => (values ? `${key}: ${values.name}` : key),
  }),
}))

const entries: RecentWorkspace[] = [
  { path: '/notes', status: 'available' },
  { path: '/missing', status: 'missing' },
  { path: '/private', status: 'unavailable' },
]

const Harness = ({ onOpenProject }: { onOpenProject: (path: string) => void }) => {
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger>Workspaces</DropdownMenuTrigger>
      <DropdownMenuContent>
        <RecentWorkspaceMenuSection
          data={{
            paths: entries.map((entry) => entry.path),
            rootPath: '/notes',
            rootKind: 'external',
            currentLabel: 'Current',
            openLabel: 'Open {name}',
            emptyLabel: 'No history',
            sectionLabel: 'Recent',
          }}
          enabled={open}
          opening={false}
          onOpenProject={onOpenProject}
          onRemoved={() => setOpen(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const renderMenu = async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onOpenProject = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <Harness onOpenProject={onOpenProject} />
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Workspaces' }))
  return { user, onOpenProject }
}

describe('recent workspace history menu', () => {
  beforeEach(() => {
    vi.mocked(recentWorkspaceApi.isAvailable).mockReturnValue(true)
    vi.mocked(recentWorkspaceApi.list).mockReset().mockResolvedValue(entries)
    vi.mocked(recentWorkspaceApi.remove).mockReset().mockResolvedValue(undefined)
    vi.mocked(recentWorkspaceApi.watch).mockReset().mockResolvedValue(vi.fn())
    useWorkspaceStore.setState({
      rootPath: '/notes',
      rootKind: 'external',
      recentProjects: entries.map((entry) => entry.path),
    })
  })

  it('disables missing and inaccessible workspaces but keeps a removal action for every entry', async () => {
    const { user, onOpenProject } = await renderMenu()
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Open notes' })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    expect(screen.getByRole('menuitem', { name: 'Open notes' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('menuitem', { name: 'Open missing' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('menuitem', { name: 'Open private' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByText('workspace.historyMissing')).toBeVisible()
    expect(screen.getByText('workspace.historyUnavailable')).toBeVisible()
    for (const name of ['notes', 'missing', 'private'])
      expect(
        screen.getByRole('menuitem', { name: `workspace.removeHistory: ${name}` }),
      ).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open missing' }))
    expect(onOpenProject).not.toHaveBeenCalled()
    await user.click(screen.getByRole('menuitem', { name: 'Open notes' }))
    expect(onOpenProject).toHaveBeenCalledWith('/notes')
  })

  it.each(['notes', 'missing'])(
    'removes %s history and keeps the active workspace open',
    async (name) => {
      const { user } = await renderMenu()
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
      await user.click(screen.getByRole('menuitem', { name: `workspace.removeHistory: ${name}` }))
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
      expect(recentWorkspaceApi.remove).toHaveBeenCalledWith(`/${name}`)
      expect(useWorkspaceStore.getState().recentProjects).not.toContain(`/${name}`)
      expect(useWorkspaceStore.getState().rootPath).toBe('/notes')
      vi.mocked(recentWorkspaceApi.list).mockResolvedValue(
        entries.filter((entry) => entry.path !== `/${name}`),
      )
      await user.click(screen.getByRole('button', { name: 'Workspaces' }))
      await waitFor(() =>
        expect(screen.queryByRole('menuitem', { name: `Open ${name}` })).not.toBeInTheDocument(),
      )
    },
  )

  it('blocks opening while checking and refreshes availability every time the menu reopens', async () => {
    let finish!: (value: RecentWorkspace[]) => void
    vi.mocked(recentWorkspaceApi.list).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { user } = await renderMenu()
    expect(screen.getByRole('status')).toHaveTextContent('workspace.checkingHistory')
    expect(screen.getByRole('menuitem', { name: 'Open notes' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    finish(entries)
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    await user.keyboard('{Escape}')
    vi.mocked(recentWorkspaceApi.list).mockResolvedValue(
      entries.map((entry) => ({ ...entry, status: 'missing' })),
    )
    await user.click(screen.getByRole('button', { name: 'Workspaces' }))
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Open notes' })).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    expect(recentWorkspaceApi.list).toHaveBeenCalledTimes(2)
  })

  it('shows check failures and supports retry without assuming paths are valid', async () => {
    vi.mocked(recentWorkspaceApi.list).mockRejectedValueOnce(new Error('IPC unavailable'))
    const { user } = await renderMenu()
    await user.click(await screen.findByRole('menuitem', { name: 'workspace.historyCheckFailed' }))
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Open notes' })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
  })

  it('retains history on removal failure and lets the user retry', async () => {
    vi.mocked(recentWorkspaceApi.remove).mockRejectedValueOnce(new Error('database busy'))
    const { user } = await renderMenu()
    await user.click(
      await screen.findByRole('menuitem', { name: 'workspace.removeHistory: missing' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('workspace.historyRemoveFailed')
    expect(useWorkspaceStore.getState().recentProjects).toContain('/missing')
    expect(screen.getByRole('menuitem', { name: 'Open missing' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'workspace.removeHistory: missing' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('prevents duplicate removal while a mutation is pending', async () => {
    let finish!: () => void
    vi.mocked(recentWorkspaceApi.remove).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { user } = await renderMenu()
    await user.click(
      await screen.findByRole('menuitem', { name: 'workspace.removeHistory: notes' }),
    )
    const remove = screen.getByRole('menuitem', { name: 'workspace.removeHistory: notes' })
    await waitFor(() => expect(remove).toHaveAttribute('aria-disabled', 'true'))
    fireEvent.click(remove)
    expect(recentWorkspaceApi.remove).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('renders an empty history from the backend', async () => {
    vi.mocked(recentWorkspaceApi.list).mockResolvedValue([])
    await renderMenu()
    expect(await screen.findByRole('menuitem', { name: 'No history' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('can remove history even if its availability check failed', async () => {
    vi.mocked(recentWorkspaceApi.list).mockRejectedValue(new Error('check unavailable'))
    const { user } = await renderMenu()
    await screen.findByRole('menuitem', { name: 'workspace.historyCheckFailed' })
    await user.click(screen.getByRole('menuitem', { name: 'workspace.removeHistory: missing' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(useWorkspaceStore.getState().recentProjects).not.toContain('/missing')
  })

  it('updates missing and recovered directories while the menu remains open', async () => {
    await renderMenu()
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Open notes' })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    const changed = vi.mocked(recentWorkspaceApi.watch).mock.calls[0][0]
    vi.mocked(recentWorkspaceApi.list).mockResolvedValue(
      entries.map((entry) => (entry.path === '/notes' ? { ...entry, status: 'missing' } : entry)),
    )
    changed()
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Open notes' })).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    vi.mocked(recentWorkspaceApi.list).mockResolvedValue(entries)
    changed()
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Open notes' })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
  })

  it('unsubscribes when the menu closes and ignores late change notifications', async () => {
    const stop = vi.fn()
    vi.mocked(recentWorkspaceApi.watch).mockResolvedValue(stop)
    const { user } = await renderMenu()
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    const changed = vi.mocked(recentWorkspaceApi.watch).mock.calls[0][0]
    await user.keyboard('{Escape}')
    await waitFor(() => expect(stop).toHaveBeenCalledOnce())
    const previousRequests = vi.mocked(recentWorkspaceApi.list).mock.calls.length
    changed()
    expect(recentWorkspaceApi.list).toHaveBeenCalledTimes(previousRequests)
  })

  it('cleans up a subscription that finishes starting after the menu closes', async () => {
    const stop = vi.fn()
    let finish!: (value: () => void) => void
    vi.mocked(recentWorkspaceApi.watch).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { user } = await renderMenu()
    await user.keyboard('{Escape}')
    finish(stop)
    await waitFor(() => expect(stop).toHaveBeenCalledOnce())
  })

  it('reports watch startup failures and keeps the history usable with periodic checks', async () => {
    vi.mocked(recentWorkspaceApi.watch).mockRejectedValue(new Error('watch unavailable'))
    await renderMenu()
    expect(await screen.findByText('workspace.historyWatchFailed')).toBeVisible()
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Open notes' })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
  })
})
