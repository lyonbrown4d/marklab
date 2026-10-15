import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScmPanel from '@/components/ScmPanel'
import i18n from '@/i18n/setup'
import { gitApi } from '@/services/gitApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/events', () => ({ listen: vi.fn(async () => vi.fn()) }))
vi.mock('@/services/fsApi', () => ({ fsApi: { flushBuffers: vi.fn() } }))
vi.mock('@/components/git/GitManagementDialog', () => ({ GitManagementDialog: () => null }))
vi.mock('@/services/gitApi', () => {
  const gitApi = {
    getStatus: vi.fn(),
    getRemoteStatus: vi.fn(),
    getOperationState: vi.fn(),
    fetch: vi.fn(),
    pull: vi.fn(),
    push: vi.fn(),
    setRemote: vi.fn(),
    removeRemote: vi.fn(),
  }
  return { gitApi, gitApiForWorkspace: () => gitApi }
})
const remote = {
  remotes: [
    {
      name: 'origin',
      fetch_url: 'https://example.com/old.git',
      push_url: 'https://example.com/old.git',
    },
    {
      name: 'backup',
      fetch_url: 'https://example.com/backup.git',
      push_url: 'https://example.com/backup.git',
    },
  ],
  branch: 'main',
  upstream: 'origin/main',
  ahead: 2,
  behind: 3,
  detached: false,
}
const renderPanel = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(<ScmPanel rootPath="/repo" rootKind="internal" collapsed={false} onOpenDiff={vi.fn()} />, {
    wrapper,
  })
}

describe('source control remote operations', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    usePreferencesStore.setState({ locale: 'en-US' })
    await i18n.changeLanguage('en-US')
    vi.mocked(gitApi.getStatus).mockResolvedValue({
      repo: { is_repository: true, branch: 'main' },
      staged: [],
      unstaged: [],
      untracked: [],
      conflicts: [],
    })
    vi.mocked(gitApi.getOperationState).mockResolvedValue({ operation: null })
    vi.mocked(gitApi.getRemoteStatus).mockResolvedValue(remote)
    vi.mocked(gitApi.setRemote).mockResolvedValue(remote)
    vi.mocked(gitApi.removeRemote).mockResolvedValue(remote)
  })
  it('fetches the chosen remote and shows ahead and behind counts', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.fetch).mockResolvedValue(remote)
    renderPanel()
    expect(await screen.findByText(/2 ahead.*3 behind/)).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Remote' }))
    await user.click(screen.getByRole('option', { name: 'backup' }))
    await user.click(screen.getByRole('button', { name: 'Fetch' }))
    expect(gitApi.fetch).toHaveBeenCalledWith('backup')
  })
  it('confirms remote add or update before applying the named URL', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Remotes' }))
    const editor = screen.getByRole('dialog', { name: 'Remotes' })
    await user.clear(within(editor).getByRole('textbox', { name: 'Remote name' }))
    await user.type(within(editor).getByRole('textbox', { name: 'Remote name' }), 'fork')
    await user.type(
      within(editor).getByRole('textbox', { name: 'Remote URL' }),
      'https://example.com/fork.git',
    )
    await user.click(within(editor).getByRole('button', { name: 'Save remote' }))
    const confirmation = screen.getByRole('dialog', { name: 'Save remote' })
    expect(confirmation).toHaveTextContent('fork')
    expect(confirmation).toHaveTextContent('https://example.com/fork.git')
    expect(gitApi.setRemote).not.toHaveBeenCalled()
    await user.click(within(confirmation).getByRole('button', { name: 'Save remote' }))
    await waitFor(() =>
      expect(gitApi.setRemote).toHaveBeenCalledWith('fork', 'https://example.com/fork.git'),
    )
  })
  it('cancels removal, then surfaces an explicit removal error without closing confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.removeRemote).mockRejectedValue(new Error('Remote configuration is read-only'))
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Remotes' }))
    const editor = screen.getByRole('dialog', { name: 'Remotes' })
    await user.click(within(editor).getByRole('button', { name: 'Remove remote: origin' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Remove remote' })).getByRole('button', {
        name: 'Cancel',
      }),
    )
    expect(gitApi.removeRemote).not.toHaveBeenCalled()
    await user.click(within(editor).getByRole('button', { name: 'Remove remote: origin' }))
    const confirmation = screen.getByRole('dialog', { name: 'Remove remote' })
    await user.click(within(confirmation).getByRole('button', { name: 'Remove remote' }))
    expect(await within(confirmation).findByRole('alert')).toHaveTextContent(
      'Remote configuration is read-only',
    )
    expect(gitApi.removeRemote).toHaveBeenCalledWith('origin')
  })
  it('disables publish and pull on a detached head', async () => {
    vi.mocked(gitApi.getRemoteStatus).mockResolvedValue({ ...remote, detached: true })
    renderPanel()
    await screen.findByText(/2 ahead.*3 behind/)
    expect(screen.getByRole('button', { name: 'Push' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pull' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeEnabled()
  })
  it('prefills an existing remote for editing, blocks empty URLs and closes safely', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Remotes' }))
    const editor = screen.getByRole('dialog', { name: 'Remotes' })
    await user.click(within(editor).getAllByRole('button', { name: 'Edit' })[0]!)
    expect(within(editor).getByRole('textbox', { name: 'Remote URL' })).toHaveValue(
      'https://example.com/old.git',
    )
    await user.clear(within(editor).getByRole('textbox', { name: 'Remote URL' }))
    expect(within(editor).getByRole('button', { name: 'Save remote' })).toBeDisabled()
    await user.click(within(editor).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Remotes' })).not.toBeInTheDocument()
    expect(gitApi.setRemote).not.toHaveBeenCalled()
  })
})
