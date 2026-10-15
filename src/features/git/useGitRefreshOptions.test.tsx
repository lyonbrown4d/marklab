import type { PropsWithChildren } from 'react'
import type { QueryFunction } from '@tanstack/react-query'
import { QueryClient, QueryClientProvider, focusManager, useQuery } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGitRefreshOptions } from '@/features/git/useGitRefreshOptions'

const ROOT = '/repo'
const clients: QueryClient[] = []
let visible = true
let focused = true

const tick = async (milliseconds = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  })
}
const lifecycle = async (event: 'focus' | 'blur' | 'visibilitychange') => {
  await act(async () => {
    ;(event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event))
  })
  await tick()
}
const setup = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  clients.push(client)
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
const useLocalRead = (read: QueryFunction<string>, name = 'git-status', enabled = true) => {
  const options = useGitRefreshOptions(ROOT)
  return useQuery({
    queryKey: [name, ROOT],
    queryFn: read,
    enabled,
    staleTime: Infinity,
    ...options,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  visible = true
  focused = true
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() =>
    visible ? 'visible' : 'hidden',
  )
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused)
  focusManager.setFocused(undefined)
})
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  focusManager.setFocused(undefined)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('foreground Git query refresh', () => {
  it('reduces unchanged polls and detects an external change within the bounded fallback', async () => {
    let disk = 'initial'
    const read = vi.fn(async () => disk)
    const { wrapper } = setup()
    const { result } = renderHook(() => useLocalRead(read), { wrapper })
    await tick()
    await tick(15_000)
    expect(read).toHaveBeenCalledTimes(4)
    await tick(14_999)
    expect(read).toHaveBeenCalledTimes(4)
    await tick(1)
    expect(read).toHaveBeenCalledTimes(5)
    await tick(30_000)
    expect(read).toHaveBeenCalledTimes(7)
    disk = 'external index-only update'
    await tick(29_999)
    expect(read).toHaveBeenCalledTimes(7)
    await tick(2)
    expect(result.current.data).toBe(disk)
    expect(read).toHaveBeenCalledTimes(8)
    await tick(5_000)
    expect(read).toHaveBeenCalledTimes(9)
  })

  it('observes external local changes every five seconds even while cached data is fresh', async () => {
    let disk = 'initial'
    const read = vi.fn(async () => disk)
    const { wrapper } = setup()
    const { result } = renderHook(() => useLocalRead(read), { wrapper })
    await tick()
    expect(result.current.data).toBe('initial')
    disk = 'external commit'
    await tick(4_999)
    expect(read).toHaveBeenCalledTimes(1)
    await tick(1)
    await tick(1)
    expect(result.current.data).toBe('external commit')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('pauses while hidden and immediately catches up when visibility returns', async () => {
    let disk = 'initial'
    const read = vi.fn(async () => disk)
    const { wrapper } = setup()
    const { result } = renderHook(() => useLocalRead(read), { wrapper })
    await tick()
    visible = false
    await lifecycle('visibilitychange')
    disk = 'background commit'
    await tick(15_000)
    expect(read).toHaveBeenCalledTimes(1)
    visible = true
    await lifecycle('visibilitychange')
    expect(result.current.data).toBe('background commit')
    expect(read).toHaveBeenCalledTimes(2)
    await tick(5_000)
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('pauses for a visible but unfocused window and refreshes immediately on focus', async () => {
    let disk = 'initial'
    const read = vi.fn(async () => disk)
    const { wrapper } = setup()
    const { result } = renderHook(() => useLocalRead(read), { wrapper })
    await tick()
    focused = false
    await lifecycle('blur')
    disk = 'other window commit'
    await tick(15_000)
    expect(read).toHaveBeenCalledTimes(1)
    focused = true
    await lifecycle('focus')
    expect(result.current.data).toBe('other window commit')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('pauses intervals and visibility refresh while a repository mutation is pending', async () => {
    let disk = 'initial'
    const read = vi.fn(async () => disk)
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useLocalRead(read), { wrapper })
    await tick()
    let finish!: () => void
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ['git-repository-action', ROOT],
      mutationFn: () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    })
    let completion!: Promise<void>
    await act(async () => {
      completion = mutation.execute(undefined)
    })
    await tick()
    disk = 'mutation in progress'
    await tick(10_000)
    expect(read).toHaveBeenCalledTimes(1)
    visible = false
    await lifecycle('visibilitychange')
    visible = true
    await lifecycle('visibilitychange')
    expect(read).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish()
      await completion
    })
    await tick()
    disk = 'mutation finished'
    await tick(5_000)
    await tick(1)
    expect(result.current.data).toBe('mutation finished')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('focus refreshes only active local queries in the current repository', async () => {
    const { client, wrapper } = setup()
    const local = vi.fn(async () => 'local')
    const other = vi.fn(async () => 'other')
    const inactive = vi.fn(async () => 'inactive')
    const disabled = vi.fn(async () => 'disabled')
    const network = vi.fn(async () => 'network')
    await client.query({
      queryKey: ['git-history', ROOT],
      queryFn: inactive,
      staleTime: Infinity,
    })
    renderHook(
      () => {
        useLocalRead(local)
        useLocalRead(disabled, 'git-stashes', false)
        useQuery({
          queryKey: ['git-status', '/other'],
          queryFn: other,
          refetchOnWindowFocus: false,
        })
        useQuery({ queryKey: ['git-fetch', ROOT], queryFn: network, refetchOnWindowFocus: false })
      },
      { wrapper },
    )
    await tick()
    focused = false
    await lifecycle('blur')
    focused = true
    await lifecycle('focus')
    expect(local).toHaveBeenCalledTimes(2)
    expect(other).toHaveBeenCalledTimes(1)
    expect(inactive).toHaveBeenCalledTimes(1)
    expect(disabled).not.toHaveBeenCalled()
    expect(network).toHaveBeenCalledTimes(1)
  })

  it('deduplicates focus refreshes across mounted hooks without cancelling an in-flight read', async () => {
    const { wrapper } = setup()
    let finish!: (value: string) => void
    const aborted = vi.fn()
    const read = vi
      .fn<QueryFunction<string>>()
      .mockImplementationOnce(async () => 'initial')
      .mockImplementation(({ signal }) => {
        signal.addEventListener('abort', aborted)
        return new Promise<string>((resolve) => {
          finish = resolve
        })
      })
    const { result } = renderHook(() => [useLocalRead(read), useLocalRead(read)], { wrapper })
    await tick()
    await lifecycle('focus')
    await lifecycle('focus')
    expect(read).toHaveBeenCalledTimes(2)
    expect(aborted).not.toHaveBeenCalled()
    await act(async () => {
      finish('external commit')
    })
    await tick()
    expect(result.current.map((query) => query.data)).toEqual([
      'external commit',
      'external commit',
    ])
  })

  it('retains the last data on a failed poll and recovers on the next interval', async () => {
    const read = vi
      .fn(async () => 'external commit')
      .mockResolvedValueOnce('initial')
      .mockRejectedValueOnce(new Error('Repository temporarily busy'))
    const { wrapper } = setup()
    const { result } = renderHook(() => useLocalRead(read), { wrapper })
    await tick()
    await tick(5_000)
    await tick(1)
    expect(result.current.data).toBe('initial')
    expect(result.current.error?.message).toBe('Repository temporarily busy')
    await tick(5_000)
    await tick(1)
    expect(result.current.data).toBe('external commit')
    expect(result.current.error).toBeNull()
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('releases interval and lifecycle refreshes when the last observer unmounts', async () => {
    const read = vi.fn(async () => 'initial')
    const { wrapper } = setup()
    const { unmount } = renderHook(() => useLocalRead(read), { wrapper })
    await tick()
    unmount()
    await lifecycle('focus')
    await lifecycle('visibilitychange')
    await tick(15_000)
    expect(read).toHaveBeenCalledTimes(1)
  })
})
