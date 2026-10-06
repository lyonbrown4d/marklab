import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraphData } from '@/app/useGraphData'
import { fsApi, type FsGraph, type FsWorkspaceIndex } from '@/services/fsApi'

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/fsApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/fsApi')>('@/services/fsApi')
  return {
    ...actual,
    fsApi: {
      ...actual.fsApi,
      getWorkspaceGraph: vi.fn(),
    },
  }
})

const INDEX: FsWorkspaceIndex = {
  files: [
    {
      path: 'notes/a.md',
      headings: [],
      links: [
        {
          source_path: 'notes/a.md',
          text: 'B',
          target: 'b.md',
          link_type: 'markdown',
          target_path: 'notes/b.md',
          is_external: false,
          context: 'B',
          line: 1,
          column: 1,
        },
      ],
      assets: [],
    },
  ],
}
const graph = (label: string): FsGraph => ({
  mode: 'mindmap',
  nodes: [{ id: `file:${label}`, kind: 'file', label, path: `${label}.md` }],
  edges: [],
})
const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
const createWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe('useGraphData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not share workspace graph queries between workspaces with identical indexes', async () => {
    vi.mocked(fsApi.getWorkspaceGraph)
      .mockResolvedValueOnce(graph('first'))
      .mockResolvedValueOnce(graph('second'))
    const queryClient = createQueryClient()
    const { result, rerender } = renderHook(
      ({ workspaceKey }) => useGraphData('workspace', workspaceKey, INDEX, 'none'),
      { initialProps: { workspaceKey: 'directory:C:/one' }, wrapper: createWrapper(queryClient) },
    )
    await waitFor(() => expect(result.current.graph.nodes[0]?.data.label).toBe('first'))

    rerender({ workspaceKey: 'directory:C:/two' })

    await waitFor(() => expect(result.current.graph.nodes[0]?.data.label).toBe('second'))
    expect(fsApi.getWorkspaceGraph).toHaveBeenCalledTimes(2)
  })

  it('starts the workspace graph before the index is ready', async () => {
    vi.mocked(fsApi.getWorkspaceGraph).mockResolvedValueOnce(graph('early'))
    const queryClient = createQueryClient()
    const { result } = renderHook(
      () => useGraphData('workspace', 'directory:C:/one', null, 'none'),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.graph.nodes[0]?.data.label).toBe('early'))
    expect(fsApi.getWorkspaceGraph).toHaveBeenCalledOnce()
  })

  it('does not request the same graph again when its index revision arrives', async () => {
    vi.mocked(fsApi.getWorkspaceGraph).mockResolvedValueOnce(graph('stable'))
    const queryClient = createQueryClient()
    const { result, rerender } = renderHook(
      ({ index }) => useGraphData('workspace', 'directory:C:/one', index, 'none'),
      {
        initialProps: { index: null as FsWorkspaceIndex | null },
        wrapper: createWrapper(queryClient),
      },
    )
    await waitFor(() => expect(result.current.graph.nodes[0]?.data.label).toBe('stable'))

    const changed: FsWorkspaceIndex = {
      files: [
        {
          ...INDEX.files[0],
          links: [{ ...INDEX.files[0].links[0], target: 'other.md' }],
        },
      ],
    }
    rerender({ index: changed })

    await waitFor(() => expect(result.current.graph.nodes[0]?.data.label).toBe('stable'))
    expect(fsApi.getWorkspaceGraph).toHaveBeenCalledOnce()
  })

  it('refreshes the graph when workspace paths change after initial hydration', async () => {
    vi.mocked(fsApi.getWorkspaceGraph)
      .mockResolvedValueOnce(graph('before'))
      .mockResolvedValueOnce(graph('after'))
    const queryClient = createQueryClient()
    const { result, rerender } = renderHook(
      ({ index }) => useGraphData('workspace', 'directory:C:/one', index, 'none'),
      { initialProps: { index: INDEX }, wrapper: createWrapper(queryClient) },
    )
    await waitFor(() => expect(result.current.graph.nodes[0]?.data.label).toBe('before'))

    rerender({
      index: {
        ...INDEX,
        files: [{ ...INDEX.files[0], path: 'notes/renamed.md' }],
      },
    })

    await waitFor(() => expect(result.current.graph.nodes[0]?.data.label).toBe('after'))
    expect(fsApi.getWorkspaceGraph).toHaveBeenCalledTimes(2)
  })

  it('exposes errors and a stable retry for workspace graphs', async () => {
    vi.mocked(fsApi.getWorkspaceGraph)
      .mockRejectedValueOnce(new Error('graph unavailable'))
      .mockResolvedValueOnce(graph('ok'))
    const queryClient = createQueryClient()
    const { result, rerender } = renderHook(
      () => useGraphData('workspace', 'directory:C:/one', INDEX, 'none'),
      { wrapper: createWrapper(queryClient) },
    )
    await waitFor(() => expect(result.current.error).toEqual(new Error('graph unavailable')))
    const retry = result.current.retry

    rerender()
    expect(result.current.retry).toBe(retry)
    await act(async () => {
      await result.current.retry()
    })

    await waitFor(() => expect(result.current.graph.nodes[0]?.data.label).toBe('ok'))
    expect(result.current.error).toBeNull()
  })

  it('distinguishes initial loading from background refresh for workspace graphs', async () => {
    const first = deferred<FsGraph>()
    const second = deferred<FsGraph>()
    vi.mocked(fsApi.getWorkspaceGraph)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const queryClient = createQueryClient()
    const { result } = renderHook(
      () => useGraphData('workspace', 'directory:C:/one', INDEX, 'none'),
      { wrapper: createWrapper(queryClient) },
    )
    expect(result.current.loading).toBe(true)
    expect(result.current.refreshing).toBe(false)
    act(() => first.resolve(graph('cached')))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      void queryClient.invalidateQueries({
        queryKey: ['workspace-graph', 'directory:C:/one'],
      })
    })
    await waitFor(() => expect(result.current.refreshing).toBe(true))
    expect(result.current.loading).toBe(false)
    expect(result.current.graph.nodes[0]?.data.label).toBe('cached')
    act(() => second.resolve(graph('fresh')))
    await waitFor(() => expect(result.current.refreshing).toBe(false))
  })
})
