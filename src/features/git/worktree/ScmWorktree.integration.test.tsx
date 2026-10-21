import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScmPanel from '@/components/ScmPanel'
import i18n from '@/i18n/setup'
import { gitApi, type GitStatusSnapshot } from '@/services/gitApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/events', () => ({ listen: vi.fn(async () => vi.fn()) }))
vi.mock('@/services/fsApi', () => ({ fsApi: { flushBuffers: vi.fn(async () => undefined) } }))
vi.mock('@/components/git/GitManagementDialog', () => ({ GitManagementDialog: () => null }))
vi.mock('@/services/gitApi', () => {
  const gitApi = {
    getStatus: vi.fn(),
    initRepo: vi.fn(),
    stage: vi.fn(),
    unstage: vi.fn(),
    discard: vi.fn(),
    commitStaged: vi.fn(),
    commitAll: vi.fn(),
    getRemoteStatus: vi.fn(),
    getOperationState: vi.fn(),
    fetch: vi.fn(),
    pull: vi.fn(),
    push: vi.fn(),
    setRemote: vi.fn(),
    removeRemote: vi.fn(),
    continueOperation: vi.fn(),
    abortOperation: vi.fn(),
  }
  return { gitApi, gitApiForWorkspace: () => gitApi }
})
const change = (path: string) => ({
  path,
  old_path: null,
  status: 'modified' as const,
  detail: 'modified',
})
const snapshot = (overrides: Partial<GitStatusSnapshot> = {}): GitStatusSnapshot => ({
  repo: { workdir: null, git_dir: null, head: null, is_repository: true, branch: 'main' },
  staged: [],
  unstaged: [],
  untracked: [],
  conflicts: [],
  ...overrides,
})
const remote = {
  remotes: [
    {
      name: 'origin',
      fetch_url: 'https://example.com/repo.git',
      push_url: 'https://example.com/repo.git',
    },
  ],
  branch: 'main',
  upstream: null,
  ahead: 1,
  behind: 0,
  detached: false,
}
const renderPanel = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const onOpenFile = vi.fn()
  const props = {
    rootPath: '/repo/one',
    rootKind: 'internal' as const,
    collapsed: false,
    onOpenDiff: vi.fn(),
    onOpenFile,
  }
  const view = render(<ScmPanel {...props} />, { wrapper })
  return {
    client,
    onOpenFile,
    rerender: (rootPath: string) => view.rerender(<ScmPanel {...props} rootPath={rootPath} />),
    onOpenDiff: props.onOpenDiff,
  }
}

describe('source control worktree operations', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    usePreferencesStore.setState({ locale: 'en-US' })
    await i18n.changeLanguage('en-US')
    vi.mocked(gitApi.getStatus).mockResolvedValue(snapshot())
    vi.mocked(gitApi.getRemoteStatus).mockResolvedValue(remote)
    vi.mocked(gitApi.getOperationState).mockResolvedValue({ operation: null })
  })
  it('stages and unstages exactly the selected file and exposes the ninth change', async () => {
    const user = userEvent.setup()
    const files = Array.from({ length: 9 }, (_, index) => change(`file-${index + 1}.md`))
    vi.mocked(gitApi.getStatus).mockResolvedValue(
      snapshot({ unstaged: files, staged: [change('staged.md')] }),
    )
    vi.mocked(gitApi.stage).mockResolvedValue(
      snapshot({ unstaged: files, staged: [change('staged.md')] }),
    )
    vi.mocked(gitApi.unstage).mockResolvedValue(snapshot())
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Stage: file-9.md' }))
    expect(gitApi.stage).toHaveBeenCalledWith(['file-9.md'])
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Unstage: staged.md' })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Unstage: staged.md' }))
    expect(gitApi.unstage).toHaveBeenCalledWith(['staged.md'])
  })
  it('stages the entire displayed group and reports stage failures', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.getStatus).mockResolvedValue(
      snapshot({ unstaged: [change('a.md'), change('b.md')] }),
    )
    vi.mocked(gitApi.stage).mockRejectedValue(new Error('Index is locked by another process'))
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Stage all' }))
    expect(gitApi.stage).toHaveBeenCalledWith(['a.md', 'b.md'])
    expect(
      (await screen.findByText('Error: Index is locked by another process')).closest(
        '[role="alert"]',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Commit staged changes' })).toBeDisabled()
  })
  it('commits staged files only, preserving unstaged work', async () => {
    const user = userEvent.setup()
    const state = snapshot({ staged: [change('staged.md')], unstaged: [change('unfinished.md')] })
    vi.mocked(gitApi.getStatus).mockResolvedValue(state)
    vi.mocked(gitApi.commitStaged).mockResolvedValue(snapshot({ unstaged: state.unstaged }))
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Commit staged changes' }))
    const dialog = screen.getByRole('dialog', { name: 'Commit staged changes' })
    expect(dialog).toHaveTextContent('1 staged files')
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Commit message' }),
      'Ship selected change',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Commit staged changes' }))
    await waitFor(() => expect(gitApi.commitStaged).toHaveBeenCalledWith('Ship selected change'))
    expect(gitApi.stage).not.toHaveBeenCalled()
    expect(gitApi.commitAll).not.toHaveBeenCalled()
  })
  it('keeps a failed commit open with the actionable error', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.getStatus).mockResolvedValue(snapshot({ staged: [change('staged.md')] }))
    vi.mocked(gitApi.commitStaged).mockRejectedValue(new Error('Configure Git author identity'))
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Commit staged changes' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'Commit message' }), 'Update')
    await user.click(within(dialog).getByRole('button', { name: 'Commit staged changes' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Configure Git author identity',
    )
    expect(dialog).toBeInTheDocument()
  })
  it('requires confirmation for exactly the selected untracked file', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.getStatus).mockResolvedValue(
      snapshot({
        untracked: [
          { old_path: null, path: 'new.md', status: 'untracked', detail: '' },
          { old_path: null, path: 'keep.md', status: 'untracked', detail: '' },
        ],
      }),
    )
    vi.mocked(gitApi.discard).mockResolvedValue(snapshot())
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Discard changes: new.md' }))
    const dialog = screen.getByRole('dialog', { name: 'Discard changes' })
    expect(dialog).toHaveTextContent('new.md')
    expect(dialog).not.toHaveTextContent('keep.md')
    expect(dialog).toHaveTextContent('permanently deleted')
    expect(gitApi.discard).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }))
    expect(gitApi.discard).toHaveBeenCalledWith(['new.md'])
  })
  it('offers remote actions when clean and sets upstream on the first push', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.push).mockResolvedValue({ ...remote, upstream: 'origin/main' })
    renderPanel()
    expect(await screen.findByText('Working tree clean')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Publish branch' }))
    expect(gitApi.push).toHaveBeenCalledWith({ remote: 'origin', setUpstream: true })
  })
  it('blocks continue during conflicts and opens the merge diff before stage or abort', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.getOperationState).mockResolvedValue({ operation: 'merge' })
    vi.mocked(gitApi.getStatus).mockResolvedValue(
      snapshot({
        conflicts: [
          { old_path: null, path: 'conflict.md', status: 'conflicted', detail: 'both modified' },
        ],
      }),
    )
    vi.mocked(gitApi.abortOperation).mockResolvedValue(snapshot())
    const { onOpenFile, onOpenDiff } = renderPanel()
    expect(await screen.findByRole('button', { name: 'Continue operation' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Resolve conflict: conflict.md' }))
    expect(onOpenDiff).toHaveBeenCalledWith({
      path: 'conflict.md',
      section: 'conflicts',
      status: 'conflicted',
    })
    expect(onOpenFile).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Stage: conflict.md' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Abort operation' }))
    expect(gitApi.abortOperation).not.toHaveBeenCalled()
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Abort operation' }),
    )
    expect(gitApi.abortOperation).toHaveBeenCalledTimes(1)
  })
  it('continues a resolved operation', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.getOperationState).mockResolvedValue({ operation: 'rebase' })
    vi.mocked(gitApi.continueOperation).mockResolvedValue(snapshot())
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Continue operation' }))
    expect(gitApi.continueOperation).toHaveBeenCalledTimes(1)
  })
  it('guards concurrent actions and applies late results to the original workspace only', async () => {
    const user = userEvent.setup()
    let resolveStage!: (value: GitStatusSnapshot) => void
    vi.mocked(gitApi.getStatus).mockResolvedValue(
      snapshot({ unstaged: [change('one.md'), change('two.md')] }),
    )
    vi.mocked(gitApi.stage).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStage = resolve
        }),
    )
    const { client, rerender } = renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Stage: one.md' }))
    expect(screen.getByRole('button', { name: 'Stage: two.md' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeDisabled()
    rerender('/repo/two')
    expect(await screen.findByRole('button', { name: 'Stage: two.md' })).toBeDisabled()
    const late = snapshot({ staged: [change('original.md')] })
    await act(async () => {
      resolveStage(late)
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stage: two.md' })).toBeEnabled())
    expect(client.getQueryData<GitStatusSnapshot>(['git-status', '/repo/one'])?.staged).toEqual(
      late.staged,
    )
    expect(client.getQueryData<GitStatusSnapshot>(['git-status', '/repo/two'])?.staged).toEqual([])
    expect(gitApi.stage).toHaveBeenCalledTimes(1)
  })
  it('lets the user close discard confirmation without changing any file', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.getStatus).mockResolvedValue(snapshot({ unstaged: [change('keep.md')] }))
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Discard changes: keep.md' }))
    const dialog = screen.getByRole('dialog', { name: 'Discard changes' })
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(gitApi.discard).not.toHaveBeenCalled()
  })
  it('lets the user cancel a staged commit draft', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.getStatus).mockResolvedValue(snapshot({ staged: [change('keep.md')] }))
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Commit staged changes' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(gitApi.commitStaged).not.toHaveBeenCalled()
  })
})
