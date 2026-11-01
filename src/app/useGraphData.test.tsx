import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { useGraphData } from '@/app/useGraphData'
import { fsApi, type FsGraph } from '@/services/fsApi'

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

const graph = (label: string): FsGraph => ({
  mode: 'relations',
  topology_key: label,
  truncated: false,
  total_nodes: 1,
  total_edges: 0,
  revision: label,
  nodes: [
    {
      id: `file:${label}`,
      position: { x: 0, y: 0 },
      kind: 'file',
      label,
      path: `${label}.md`,
      group: { key: 'Workspace', label: 'Workspace', source: 'path' },
    },
  ],
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
  beforeEach(() => {
    vi.clearAllMocks()
    usePreferencesStore.setState({ graphShowAttachments: false, graphShowMissing: true })
  })

  it('does not share workspace graph queries between workspaces with identical indexes', async () => {
    vi.mocked(fsApi.getWorkspaceGraph)
      .mockResolvedValueOnce(graph('first'))
      .mockResolvedValueOnce(graph('second'))
    const queryClient = createQueryClient()
    const { result, rerender } = renderHook(
      ({ workspaceKey }) => useGraphData('workspace', workspaceKey),
      { initialProps: { workspaceKey: 'directory:C:/one' }, wrapper: createWrapper(queryClient) },
    )
    await waitFor(() => expect(result.current.graph.nodes[0]?.label).toBe('first'))

    rerender({ workspaceKey: 'directory:C:/two' })

    await waitFor(() => expect(result.current.graph.nodes[0]?.label).toBe('second'))
    expect(fsApi.getWorkspaceGraph).toHaveBeenCalledTimes(2)
  })

  it('loads the workspace graph without requesting a renderer-side index', async () => {
    vi.mocked(fsApi.getWorkspaceGraph).mockResolvedValueOnce(graph('early'))
    const queryClient = createQueryClient()
    const { result } = renderHook(() => useGraphData('workspace', 'directory:C:/one'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.graph.nodes[0]?.label).toBe('early'))
    expect(fsApi.getWorkspaceGraph).toHaveBeenCalledOnce()
  })

  it('uses a separate bounded query when graph filters change', async () => {
    vi.mocked(fsApi.getWorkspaceGraph).mockResolvedValue(graph('stable'))
    const queryClient = createQueryClient()
    const { result } = renderHook(() => useGraphData('workspace', 'directory:C:/one'), {
      wrapper: createWrapper(queryClient),
    })
    await waitFor(() => expect(result.current.graph.nodes).toHaveLength(1))
    act(() => usePreferencesStore.getState().setGraphShowAttachments(true))
    await waitFor(() => expect(fsApi.getWorkspaceGraph).toHaveBeenCalledTimes(2))
    expect(fsApi.getWorkspaceGraph).toHaveBeenLastCalledWith(
      expect.objectContaining({
        center_path: null,
        include_attachments: true,
        max_nodes: 10_000,
      }),
    )
  })

  it('exposes errors and a stable retry for workspace graphs', async () => {
    vi.mocked(fsApi.getWorkspaceGraph)
      .mockRejectedValueOnce(new Error('graph unavailable'))
      .mockResolvedValueOnce(graph('ok'))
    const queryClient = createQueryClient()
    const { result, rerender } = renderHook(() => useGraphData('workspace', 'directory:C:/one'), {
      wrapper: createWrapper(queryClient),
    })
    await waitFor(() => expect(result.current.error).toEqual(new Error('graph unavailable')))
    const retry = result.current.retry

    rerender()
    expect(result.current.retry).toBe(retry)
    await act(async () => {
      await result.current.retry()
    })

    await waitFor(() => expect(result.current.graph.nodes[0]?.label).toBe('ok'))
    expect(result.current.error).toBeNull()
  })

  it('distinguishes initial loading from background refresh for workspace graphs', async () => {
    const first = deferred<FsGraph>()
    const second = deferred<FsGraph>()
    vi.mocked(fsApi.getWorkspaceGraph)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const queryClient = createQueryClient()
    const { result } = renderHook(() => useGraphData('workspace', 'directory:C:/one'), {
      wrapper: createWrapper(queryClient),
    })
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
    expect(result.current.graph.nodes[0]?.label).toBe('cached')
    act(() => second.resolve(graph('fresh')))
    await waitFor(() => expect(result.current.refreshing).toBe(false))
  })
})
