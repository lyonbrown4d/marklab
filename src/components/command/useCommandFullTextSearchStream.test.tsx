import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fsApi, type FsSearchResult } from '@/services/fsApi'
import { useCommandFullTextSearchStream } from '@/components/command/useCommandFullTextSearchStream'
import type { CommandSearchScope } from '@/components/command/commandSearchScope'

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    searchWorkspace: vi.fn(),
  },
}))

const searchWorkspaceMock = vi.mocked(fsApi.searchWorkspace)

const createResult = (path: string): FsSearchResult => ({
  path,
  title: path,
  line: 1,
  column: 1,
  end_column: 4,
  snippet: 'test match',
  snippet_highlights: [{ start: 0, end: 4 }],
  score: 1,
})

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

const createQueryWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  const QueryWrapper = ({ children }: PropsWithChildren) => {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return QueryWrapper
}

const advanceDebounce = async () => {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 190))
  })
}

beforeEach(() => {
  searchWorkspaceMock.mockReset()
})

describe('useCommandFullTextSearchStream', () => {
  it('only searches when open with a searchable scope and minimum query length', async () => {
    searchWorkspaceMock.mockResolvedValue([])

    const { rerender } = renderHook(
      ({ query, scope }) =>
        useCommandFullTextSearchStream({
          limit: 8,
          open: true,
          query,
          scope,
        }),
      {
        initialProps: { query: 'a', scope: 'all' as CommandSearchScope },
        wrapper: createQueryWrapper(),
      },
    )

    await advanceDebounce()
    expect(searchWorkspaceMock).not.toHaveBeenCalled()

    rerender({ query: 'ab', scope: 'files' })
    await advanceDebounce()
    expect(searchWorkspaceMock).not.toHaveBeenCalled()

    rerender({ query: 'ab', scope: 'all' })

    await waitFor(() => {
      expect(searchWorkspaceMock).toHaveBeenCalledWith('ab', 8)
    })
  })

  it('clears stale results while the next query is debouncing and fetching', async () => {
    const firstSearch = createDeferred<FsSearchResult[]>()
    const secondSearch = createDeferred<FsSearchResult[]>()
    searchWorkspaceMock
      .mockReturnValueOnce(firstSearch.promise)
      .mockReturnValueOnce(secondSearch.promise)

    const { result, rerender } = renderHook(
      ({ query }) =>
        useCommandFullTextSearchStream({
          limit: 8,
          open: true,
          query,
          scope: 'all',
        }),
      {
        initialProps: { query: 'alpha' },
        wrapper: createQueryWrapper(),
      },
    )

    await advanceDebounce()

    await act(async () => {
      firstSearch.resolve([createResult('alpha.md')])
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.fullTextResults).toHaveLength(1)
    })

    rerender({ query: 'beta' })

    expect(result.current.fullTextFetching).toBe(true)
    expect(result.current.fullTextResults).toEqual([])

    await advanceDebounce()

    expect(result.current.fullTextFetching).toBe(true)
    expect(result.current.fullTextResults).toEqual([])

    await act(async () => {
      secondSearch.resolve([createResult('beta.md')])
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.fullTextResults).toEqual([createResult('beta.md')])
    })
  })

  it('returns fullTextError when the active search fails', async () => {
    searchWorkspaceMock.mockRejectedValue(new Error('search failed'))

    const { result } = renderHook(
      () =>
        useCommandFullTextSearchStream({
          limit: 8,
          open: true,
          query: 'error',
          scope: 'text',
        }),
      { wrapper: createQueryWrapper() },
    )

    await advanceDebounce()

    await waitFor(() => {
      expect(result.current.fullTextError).toBe(true)
    })

    expect(result.current.fullTextFetching).toBe(false)
    expect(result.current.fullTextResults).toEqual([])
  })
})
