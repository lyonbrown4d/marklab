import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScmPanel from '@/components/ScmPanel'
import i18n from '@/i18n/setup'
import { gitApi, type GitStatusSnapshot } from '@/services/gitApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/events', () => ({ listen: vi.fn(async () => vi.fn()) }))
vi.mock('@/services/fsApi', () => ({ fsApi: { flushBuffers: vi.fn() } }))
vi.mock('@/components/git/GitManagementDialog', () => ({
  GitManagementDialog: ({ open, rootPath }: { open: boolean; rootPath: string }) =>
    open ? (
      <div role="dialog" aria-label="Git management">
        {rootPath}
      </div>
    ) : null,
}))
vi.mock('@/services/gitApi', () => {
  const gitApi = {
    getStatus: vi.fn(),
    initRepo: vi.fn(),
    getRemoteStatus: vi.fn(),
    getOperationState: vi.fn(),
  }
  return { gitApi, gitApiForWorkspace: () => gitApi }
})
const state: GitStatusSnapshot = {
  repo: { workdir: null, git_dir: null, head: null, is_repository: true, branch: 'main' },
  staged: [],
  unstaged: [],
  untracked: [],
  conflicts: [],
}
const renderPanel = (props: Partial<Parameters<typeof ScmPanel>[0]> = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(
    <ScmPanel
      rootPath="/repo"
      rootKind="internal"
      collapsed={false}
      onOpenDiff={vi.fn()}
      {...props}
    />,
    { wrapper },
  )
}
describe('source control lifecycle', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    usePreferencesStore.setState({ locale: 'en-US' })
    await i18n.changeLanguage('en-US')
    vi.mocked(gitApi.getStatus).mockResolvedValue(state)
    vi.mocked(gitApi.getOperationState).mockResolvedValue({ operation: null })
    vi.mocked(gitApi.getRemoteStatus).mockResolvedValue({
      remotes: [],
      branch: 'main',
      upstream: null,
      ahead: 0,
      behind: 0,
      detached: false,
    })
  })
  it('initializes only after confirmation and updates the repository display', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.getStatus).mockResolvedValueOnce({
      ...state,
      repo: { workdir: null, git_dir: null, branch: null, head: null, is_repository: false },
    })
    vi.mocked(gitApi.initRepo).mockResolvedValue(state.repo)
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Initialize Repository' }))
    expect(gitApi.initRepo).not.toHaveBeenCalled()
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Initialize Repository' }),
    )
    await waitFor(() => expect(gitApi.initRepo).toHaveBeenCalledWith('/repo'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Working tree clean')).toBeInTheDocument()
  })
  it('cancels initialization and opens history with the current root', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.getStatus).mockResolvedValue({
      ...state,
      repo: { workdir: null, git_dir: null, branch: null, head: null, is_repository: false },
    })
    const view = renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Initialize Repository' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(gitApi.initRepo).not.toHaveBeenCalled()
    view.unmount()
    vi.mocked(gitApi.getStatus).mockResolvedValue(state)
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'History and branches' }))
    expect(screen.getByRole('dialog', { name: 'Git management' })).toHaveTextContent('/repo')
  })
  it('does not request Git for an empty workspace and disables a collapsed single file', () => {
    const empty = renderPanel({ rootPath: '' })
    expect(empty.container).toBeEmptyDOMElement()
    empty.unmount()
    renderPanel({ collapsed: true, rootKind: 'single' })
    expect(
      screen.getByRole('button', { name: 'Source control is unavailable for a single file' }),
    ).toBeDisabled()
    expect(gitApi.getStatus).not.toHaveBeenCalled()
  })
})
