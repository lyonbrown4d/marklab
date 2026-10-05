import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceIndex } from '@/app/useWorkspaceIndex'
import { listen } from '@/runtime/events'
import { fsApi } from '@/services/fsApi'

let bufferStatusHandler: ((event: { payload: unknown }) => void) | undefined
const ENTRIES = [{ path: 'D:/notes/today.md', kind: 'file' }] as const

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/runtime/events', () => ({
  listen: vi.fn(async (_event: string, handler: (event: { payload: unknown }) => void) => {
    bufferStatusHandler = handler
    return vi.fn()
  }),
}))

vi.mock('@/services/fsApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/fsApi')>('@/services/fsApi')
  return {
    ...actual,
    fsApi: {
      ...actual.fsApi,
      getWorkspaceIndex: vi.fn(),
    },
  }
})

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      key === 'workspaceIndex.refreshFailed' ? 'Failed to refresh workspace index' : key,
  }),
}))

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

const createWrapper = (queryClient: QueryClient) => {
  const QueryWrapper = ({ children }: PropsWithChildren) => {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return QueryWrapper
}

describe('useWorkspaceIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bufferStatusHandler = undefined
    vi.mocked(fsApi.getWorkspaceIndex).mockResolvedValue({ files: [] })
  })

  it('does not share an index between workspaces with identical entries', async () => {
    const queryClient = createQueryClient()
    const { rerender } = renderHook(
      ({ workspaceKey }) => useWorkspaceIndex(workspaceKey, [...ENTRIES], true),
      {
        initialProps: { workspaceKey: 'directory:D:/notes' },
        wrapper: createWrapper(queryClient),
      },
    )
    await waitFor(() => expect(fsApi.getWorkspaceIndex).toHaveBeenCalledOnce())

    rerender({ workspaceKey: 'directory:E:/notes' })

    await waitFor(() => expect(fsApi.getWorkspaceIndex).toHaveBeenCalledTimes(2))
  })

  it('exposes loading, refreshing, error, retry, and retained data', async () => {
    const queryClient = createQueryClient()
    let resolveIndex: ((value: { files: [] }) => void) | undefined
    vi.mocked(fsApi.getWorkspaceIndex).mockImplementation(
      () => new Promise((resolve) => (resolveIndex = resolve)),
    )

    const { result } = renderHook(
      () => useWorkspaceIndex('directory:D:/notes', [...ENTRIES], true),
      { wrapper: createWrapper(queryClient) },
    )

    expect(result.current).toMatchObject({
      data: null,
      error: null,
      loading: true,
      refreshing: false,
    })
    expect(result.current.retry).toBeTypeOf('function')

    await act(async () => resolveIndex?.({ files: [] }))
    await waitFor(() => expect(result.current.data).toEqual({ files: [] }))

    vi.mocked(fsApi.getWorkspaceIndex).mockImplementation(
      () => new Promise((resolve) => (resolveIndex = resolve)),
    )
    act(() => {
      void result.current.retry()
    })
    await waitFor(() => expect(result.current.refreshing).toBe(true))
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toEqual({ files: [] })
    await act(async () => resolveIndex?.({ files: [] }))
  })

  it('shows localized feedback when refreshing the workspace index fails', async () => {
    const queryClient = createQueryClient()
    vi.spyOn(queryClient, 'invalidateQueries').mockRejectedValue(new Error('index locked'))

    renderHook(() => useWorkspaceIndex('directory:D:/notes', [...ENTRIES], true), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith('fs-buffer-status', expect.any(Function))
    })

    act(() => {
      bufferStatusHandler?.({
        payload: {
          path: 'D:/notes/today.md',
          revision: 2,
          dirty: false,
        },
      })
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to refresh workspace index', {
        description: 'Error: index locked',
      })
    })
  })

  it('coalesces a burst of dirty buffer notifications into one index refresh', async () => {
    const queryClient = createQueryClient()
    const invalidateQueries = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined)
    vi.useFakeTimers()
    try {
      renderHook(() => useWorkspaceIndex('directory:D:/notes', [...ENTRIES], true), {
        wrapper: createWrapper(queryClient),
      })
      await act(async () => Promise.resolve())
      expect(bufferStatusHandler).toBeTypeOf('function')

      act(() => {
        for (let revision = 1; revision <= 10; revision += 1) {
          bufferStatusHandler?.({
            payload: {
              path: 'D:/notes/today.md',
              revision,
              dirty: true,
            },
          })
        }
      })

      expect(invalidateQueries).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(950))
      expect(invalidateQueries).toHaveBeenCalledTimes(2)
      expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
        queryKey: ['workspace-index', 'directory:D:/notes'],
      })
      expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
        queryKey: ['workspace-graph', 'directory:D:/notes'],
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('refreshes immediately when a buffer becomes clean and cancels a pending dirty refresh', async () => {
    const queryClient = createQueryClient()
    const invalidateQueries = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined)

    vi.useFakeTimers()
    try {
      renderHook(() => useWorkspaceIndex('directory:D:/notes', [...ENTRIES], true), {
        wrapper: createWrapper(queryClient),
      })
      await act(async () => Promise.resolve())
      expect(bufferStatusHandler).toBeTypeOf('function')

      act(() => {
        bufferStatusHandler?.({
          payload: { path: 'D:/notes/today.md', revision: 1, dirty: true },
        })
        bufferStatusHandler?.({
          payload: { path: 'D:/notes/today.md', revision: 2, dirty: false },
        })
      })

      expect(invalidateQueries).toHaveBeenCalledTimes(2)
      act(() => vi.advanceTimersByTime(950))
      expect(invalidateQueries).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels a pending dirty refresh when the workspace subscription unmounts', async () => {
    const queryClient = createQueryClient()
    const invalidateQueries = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined)
    vi.useFakeTimers()
    try {
      const { unmount } = renderHook(
        () => useWorkspaceIndex('directory:D:/notes', [...ENTRIES], true),
        { wrapper: createWrapper(queryClient) },
      )
      await act(async () => Promise.resolve())
      act(() => {
        bufferStatusHandler?.({
          payload: { path: 'D:/notes/today.md', revision: 1, dirty: true },
        })
      })

      unmount()
      act(() => vi.advanceTimersByTime(950))

      expect(invalidateQueries).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
