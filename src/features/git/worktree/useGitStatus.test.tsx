import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { listen } from '@/runtime/events'
import { useGitStatus } from '@/features/git/worktree/useGitStatus'

vi.mock('@/services/gitApi', () => ({
  gitApi: {
    getStatus: vi.fn(async () => ({
      repo: { is_repository: false },
      staged: [],
      unstaged: [],
      untracked: [],
      conflicts: [],
    })),
  },
}))
vi.mock('@/runtime/events', () => ({ listen: vi.fn(async () => vi.fn()) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { ...renderHook(() => useGitStatus('/repo', true), { wrapper }), client }
}
describe('Git status subscription', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.useRealTimers())
  it('debounces filesystem events into scoped status and remote refreshes', async () => {
    vi.useFakeTimers()
    const { client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const callback = vi.mocked(listen).mock.calls[0]![1]
    await act(async () => {
      callback({ event: 'fs-changed', id: 1, payload: {} })
      callback({ event: 'fs-changed', id: 2, payload: {} })
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(invalidate).toHaveBeenCalledTimes(3)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['git-status', '/repo'] })
  })
  it('releases a listener that resolves after unmount', async () => {
    let finish!: (value: () => void) => void
    const release = vi.fn()
    vi.mocked(listen).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const { unmount } = setup()
    unmount()
    await act(async () => {
      finish(release)
    })
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('reports subscription failures and refresh errors', async () => {
    vi.mocked(listen).mockRejectedValueOnce(new Error('Subscription unavailable'))
    const { result, client } = setup()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.any(String), {
        description: 'Error: Subscription unavailable',
      }),
    )
    vi.spyOn(client, 'invalidateQueries').mockRejectedValue(new Error('Cache refresh failed'))
    await act(async () => {
      result.current.invalidateStatus()
    })
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.any(String), {
        id: 'scm-status-refresh',
        description: 'Error: Cache refresh failed',
      }),
    )
  })
})
