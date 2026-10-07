import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphData } from '@/logic/graph'
import { useWorkspaceMapNodeDetails } from '@/pages/workspace-map/useWorkspaceMapNodeDetails'
import { fsApi } from '@/services/fsApi'

vi.mock('@/services/fsApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/fsApi')>('@/services/fsApi')
  return {
    ...actual,
    fsApi: { ...actual.fsApi, getWorkspaceGraphNodeDetails: vi.fn() },
  }
})

const graph = (contentMode: 'summary' | 'full', revision = 'revision-1'): GraphData => ({
  nodes: [
    {
      id: 'file:a.md',
      type: 'file',
      data: { contentMode, label: 'a', path: 'a.md' },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
  layoutKey: 'topology',
  revision,
})

describe('useWorkspaceMapNodeDetails', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads only rendered or active nodes and changes detail mode without a topology request', async () => {
    vi.mocked(fsApi.getWorkspaceGraphNodeDetails).mockResolvedValue({
      items: [{ id: 'file:a.md', content: 'Summary' }],
      revision: 'revision-1',
      truncated: false,
    })
    const container = document.createElement('div')
    container.innerHTML = '<div class="react-flow__node" data-id="file:a.md"></div>'
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result, rerender } = renderHook(
      ({ container: currentContainer, contentMode }) =>
        useWorkspaceMapNodeDetails({
          activePath: null,
          container: currentContainer,
          graph: graph(contentMode),
          graphIdentity: 'workspace:test',
        }),
      {
        initialProps: { container: null, contentMode: 'summary' } as {
          container: HTMLElement | null
          contentMode: 'summary' | 'full'
        },
        wrapper: Wrapper,
      },
    )

    expect(fsApi.getWorkspaceGraphNodeDetails).not.toHaveBeenCalled()
    rerender({ container, contentMode: 'summary' })
    await waitFor(() => expect(result.current.nodes[0]?.data.content).toBe('Summary'))
    expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledWith({
      mode: 'summary',
      node_ids: ['file:a.md'],
      max_nodes: 32,
      revision: 'revision-1',
    })

    rerender({ container, contentMode: 'full' })
    await waitFor(() => expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledTimes(2))
    expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'full' }),
    )
  })

  it('keeps prior details while a same-revision refetch is pending', async () => {
    let resolveFull!: (
      value: Awaited<ReturnType<typeof fsApi.getWorkspaceGraphNodeDetails>>,
    ) => void
    vi.mocked(fsApi.getWorkspaceGraphNodeDetails)
      .mockResolvedValueOnce({
        items: [{ id: 'file:a.md', content: 'Summary' }],
        revision: 'revision-1',
        truncated: false,
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFull = resolve
        }),
      )
    const container = document.createElement('div')
    container.innerHTML = [
      '<div class="react-flow__viewport">',
      '<div class="react-flow__nodes">',
      '<div class="react-flow__node" data-id="file:a.md"></div>',
      '</div></div>',
    ].join('')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () =>
        useWorkspaceMapNodeDetails({
          activePath: null,
          container,
          graph: graph('summary'),
          graphIdentity: 'workspace:test',
        }),
      { wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.nodes[0]?.data.content).toBe('Summary'))

    void queryClient.invalidateQueries({ queryKey: ['workspace-graph-node-details'] })
    await waitFor(() => expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledTimes(2))
    expect(result.current.nodes[0]?.data.content).toBe('Summary')
    resolveFull({
      items: [{ id: 'file:a.md', content: 'Refreshed' }],
      revision: 'revision-1',
      truncated: false,
    })
    await waitFor(() => expect(result.current.nodes[0]?.data.content).toBe('Refreshed'))
  })

  it('rejects details returned for a different graph revision', async () => {
    vi.mocked(fsApi.getWorkspaceGraphNodeDetails).mockResolvedValue({
      items: [{ id: 'file:a.md', content: 'Stale' }],
      revision: 'revision-0',
      truncated: false,
    })
    const container = document.createElement('div')
    container.innerHTML = '<div class="react-flow__node" data-id="file:a.md"></div>'
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () =>
        useWorkspaceMapNodeDetails({
          activePath: null,
          container,
          graph: graph('summary'),
          graphIdentity: 'workspace:test',
        }),
      { wrapper: Wrapper },
    )

    await waitFor(() => expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledOnce())
    expect(result.current.nodes[0]?.data.content).toBeUndefined()
  })

  it('does not carry placeholder details across topology revisions', async () => {
    let resolveNext!: (
      value: Awaited<ReturnType<typeof fsApi.getWorkspaceGraphNodeDetails>>,
    ) => void
    vi.mocked(fsApi.getWorkspaceGraphNodeDetails)
      .mockResolvedValueOnce({
        items: [{ id: 'file:a.md', content: 'Old' }],
        revision: 'revision-1',
        truncated: false,
      })
      .mockReturnValueOnce(new Promise((resolve) => (resolveNext = resolve)))
    const container = document.createElement('div')
    container.innerHTML = '<div class="react-flow__node" data-id="file:a.md"></div>'
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result, rerender } = renderHook(
      ({ revision }) =>
        useWorkspaceMapNodeDetails({
          activePath: null,
          container,
          graph: graph('summary', revision),
          graphIdentity: 'workspace:test',
        }),
      { initialProps: { revision: 'revision-1' }, wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.nodes[0]?.data.content).toBe('Old'))

    rerender({ revision: 'revision-2' })
    await waitFor(() => expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledTimes(2))
    expect(result.current.nodes[0]?.data.content).toBeUndefined()
    resolveNext({
      items: [{ id: 'file:a.md', content: 'New' }],
      revision: 'revision-2',
      truncated: false,
    })
    await waitFor(() => expect(result.current.nodes[0]?.data.content).toBe('New'))
  })

  it('bounds retries and does not render failed detail data', async () => {
    vi.mocked(fsApi.getWorkspaceGraphNodeDetails).mockRejectedValue(new Error('details failed'))
    const container = document.createElement('div')
    container.innerHTML = '<div class="react-flow__node" data-id="file:a.md"></div>'
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () =>
        useWorkspaceMapNodeDetails({
          activePath: null,
          container,
          graph: graph('summary'),
          graphIdentity: 'workspace:test',
        }),
      { wrapper: Wrapper },
    )

    await waitFor(() => expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledTimes(2))
    expect(result.current.nodes[0]?.data.content).toBeUndefined()
  })

  it('debounces visible-set churn and releases inactive batch cache entries', async () => {
    vi.mocked(fsApi.getWorkspaceGraphNodeDetails).mockImplementation(async (request) => ({
      items: request.node_ids.map((id) => ({ id, content: id })),
      revision: request.revision,
      truncated: false,
    }))
    const container = document.createElement('div')
    container.innerHTML = [
      '<div class="react-flow__nodes">',
      '<div class="react-flow__node" data-id="file:a.md"></div>',
      '</div>',
    ].join('')
    const nodesLayer = container.querySelector('.react-flow__nodes')!
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    renderHook(
      () =>
        useWorkspaceMapNodeDetails({
          activePath: null,
          container,
          graph: graph('summary'),
          graphIdentity: 'workspace:test',
        }),
      { wrapper: Wrapper },
    )
    await waitFor(() => expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledOnce())

    nodesLayer.innerHTML = '<div class="react-flow__node" data-id="file:b.md"></div>'
    await new Promise((resolve) => setTimeout(resolve, 20))
    nodesLayer.innerHTML = '<div class="react-flow__node" data-id="file:c.md"></div>'
    await waitFor(() => expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledTimes(2))

    expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenLastCalledWith(
      expect.objectContaining({ node_ids: ['file:c.md'] }),
    )
    await waitFor(() =>
      expect(
        queryClient.getQueryCache().findAll({ queryKey: ['workspace-graph-node-details'] }).length,
      ).toBeLessThanOrEqual(1),
    )
  })

  it('resamples visible nodes after the viewport move completes', async () => {
    vi.mocked(fsApi.getWorkspaceGraphNodeDetails).mockImplementation(async (request) => ({
      items: [],
      revision: request.revision,
      truncated: false,
    }))
    const container = document.createElement('div')
    container.innerHTML = [
      '<div class="react-flow__nodes">',
      '<div class="react-flow__node" data-id="file:a.md"></div>',
      '</div>',
    ].join('')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { rerender } = renderHook(
      ({ viewportRevision }) =>
        useWorkspaceMapNodeDetails({
          activePath: null,
          container,
          graph: graph('summary'),
          graphIdentity: 'workspace:test',
          viewportRevision,
        }),
      { initialProps: { viewportRevision: 0 }, wrapper: Wrapper },
    )
    await waitFor(() => expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledOnce())

    container.querySelector('.react-flow__node')?.setAttribute('data-id', 'file:b.md')
    rerender({ viewportRevision: 1 })

    await waitFor(() => expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledTimes(2))
    expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenLastCalledWith(
      expect.objectContaining({ node_ids: ['file:b.md'] }),
    )
  })
})
