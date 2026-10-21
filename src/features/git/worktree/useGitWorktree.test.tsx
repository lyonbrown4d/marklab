import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gitApiForWorkspace, type GitStatusSnapshot } from '@/services/gitApi'
import { fsApi } from '@/services/fsApi'
import { useGitWorktree } from '@/features/git/worktree/useGitWorktree'

const api = vi.hoisted(() => ({
  getRemoteStatus: vi.fn(),
  getOperationState: vi.fn(),
  stage: vi.fn(),
  unstage: vi.fn(),
  discard: vi.fn(),
  commitStaged: vi.fn(),
  initRepo: vi.fn(),
  fetch: vi.fn(),
  pull: vi.fn(),
  push: vi.fn(),
  setRemote: vi.fn(),
  removeRemote: vi.fn(),
  continueOperation: vi.fn(),
  abortOperation: vi.fn(),
}))
vi.mock('@/services/gitApi', () => ({ gitApiForWorkspace: vi.fn(() => api) }))
vi.mock('@/services/fsApi', () => ({ fsApi: { flushBuffers: vi.fn(async () => undefined) } }))
const state: GitStatusSnapshot = {
  repo: { workdir: null, git_dir: null, branch: null, head: null, is_repository: true },
  staged: [],
  unstaged: [],
  untracked: [],
  conflicts: [],
}
const setup = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = renderHook(({ root }) => useGitWorktree(root, true, true), {
    wrapper,
    initialProps: { root: '/original' },
  })
  return { ...view, client }
}
describe('repository scoped worktree hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getRemoteStatus.mockResolvedValue({
      remotes: [],
      branch: 'main',
      upstream: null,
      ahead: 0,
      behind: 0,
      detached: false,
    })
    api.getOperationState.mockResolvedValue({ operation: null })
  })
  it('binds every API call to the original workspace and caches a late result there', async () => {
    let complete!: (value: GitStatusSnapshot) => void
    api.stage.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const { result, rerender, client } = setup()
    await waitFor(() => expect(result.current.operationQuery.isSuccess).toBe(true))
    let pending!: Promise<boolean>
    act(() => {
      pending = result.current.run({ type: 'stage', paths: ['selected.md'] })
    })
    await waitFor(() => expect(api.stage).toHaveBeenCalled())
    rerender({ root: '/new-workspace' })
    await act(async () => {
      complete(state)
      await pending
    })
    expect(gitApiForWorkspace).toHaveBeenCalledWith('/original')
    expect(client.getQueryData(['git-status', '/original'])).toEqual(state)
    expect(client.getQueryData(['git-status', '/new-workspace'])).toBeUndefined()
  })
  it('blocks duplicate calls before the pending render and refreshes all caches on errors', async () => {
    api.commitStaged.mockRejectedValue(new Error('Author missing'))
    const { result, client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    let second!: boolean
    await act(async () => {
      const first = result.current.run({ type: 'commit', message: 'Selected commit' })
      second = await result.current.run({ type: 'fetch', remote: 'origin' })
      expect(await first).toBe(false)
    })
    expect(second).toBe(false)
    expect(api.fetch).not.toHaveBeenCalled()
    expect(fsApi.flushBuffers).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.mutation.error).toEqual(new Error('Author missing')))
    for (const namespace of [
      'status',
      'remote',
      'history',
      'branches',
      'stashes',
      'operation',
      'file-diff',
      'commit-files',
      'commit-diff',
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [`git-${namespace}`, '/original'] })
    }
  })
  it('surfaces buffer-save failure without starting a Git commit', async () => {
    vi.mocked(fsApi.flushBuffers).mockRejectedValueOnce(new Error('Cannot save selected file'))
    const { result } = setup()
    await act(async () => {
      expect(await result.current.run({ type: 'commit', message: 'Save first' })).toBe(false)
    })
    expect(api.commitStaged).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(result.current.mutation.error).toEqual(new Error('Cannot save selected file')),
    )
  })
})
