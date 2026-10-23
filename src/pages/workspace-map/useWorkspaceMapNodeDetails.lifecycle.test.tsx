import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { useMemo, type PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphData } from '@/logic/graph'
import { useWorkspaceMapNodeDetails } from '@/pages/workspace-map/useWorkspaceMapNodeDetails'
import { fsApi } from '@/services/fsApi'

vi.mock('@/services/fsApi', () => ({
  fsApi: { getWorkspaceGraphNodeDetails: vi.fn() },
}))

const graph = (revision: string, paths: string[]): GraphData => ({
  nodes: paths.map((path) => ({
    id: `file:${path}`,
    type: 'file',
    data: { contentMode: 'summary', label: path, path },
    position: { x: 0, y: 0 },
  })),
  edges: [],
  layoutKey: 'topology',
  revision,
})

const advance = async (milliseconds: number) => {
  await act(async () => vi.advanceTimersByTimeAsync(milliseconds))
}

const setup = (active: boolean, paths = ['a.md']) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const container = document.createElement('div')
  container.innerHTML =
    '<div class="react-flow__nodes"><div class="react-flow__node" data-id="file:a.md"></div></div>'
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const hook = renderHook(
    ({ active, revision, graphIdentity }) => {
      const currentGraph = useMemo(() => graph(revision, paths), [revision])
      return useWorkspaceMapNodeDetails({
        active,
        activePath: null,
        container,
        graph: currentGraph,
        graphIdentity,
      })
    },
    {
      initialProps: { active, revision: 'one', graphIdentity: 'workspace:test' },
      wrapper: Wrapper,
    },
  )
  return { ...hook, container, queryClient }
}

describe('workspace map detail route lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(fsApi.getWorkspaceGraphNodeDetails).mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('does no observation or requests while inactive and resumes with the latest graph', async () => {
    vi.mocked(fsApi.getWorkspaceGraphNodeDetails).mockImplementation(async (request) => ({
      items: [{ id: 'file:a.md', content: request.revision, preview: { html: '', math: [] } }],
      revision: request.revision,
      truncated: false,
    }))
    const observe = vi.spyOn(MutationObserver.prototype, 'observe')
    const { result, rerender, container } = setup(false)
    await advance(1_000)
    rerender({ active: false, revision: 'two', graphIdentity: 'workspace:test' })
    container.querySelector('.react-flow__nodes')?.appendChild(document.createElement('div'))
    await advance(1_000)
    expect(observe).not.toHaveBeenCalled()
    expect(fsApi.getWorkspaceGraphNodeDetails).not.toHaveBeenCalled()

    rerender({ active: true, revision: 'two', graphIdentity: 'workspace:test' })
    await advance(100)
    await advance(1)
    expect(result.current.nodes[0]?.data.content).toBe('two')
    expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ revision: 'two', node_ids: ['file:a.md'] }),
    )
    observe.mockRestore()
  })

  it('releases fetched previews and cancels late results when the route becomes inactive', async () => {
    let resolvePending!: (
      value: Awaited<ReturnType<typeof fsApi.getWorkspaceGraphNodeDetails>>,
    ) => void
    vi.mocked(fsApi.getWorkspaceGraphNodeDetails)
      .mockResolvedValueOnce({
        items: [{ id: 'file:a.md', content: 'preview', preview: { html: '', math: [] } }],
        revision: 'one',
        truncated: false,
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePending = resolve
          }),
      )
    const { result, rerender, queryClient } = setup(true)
    await advance(100)
    await advance(1)
    expect(result.current.nodes[0]?.data.content).toBe('preview')
    void queryClient.invalidateQueries({ queryKey: ['workspace-graph-node-details'] })
    await advance(0)
    expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledTimes(2)

    rerender({ active: false, revision: 'one', graphIdentity: 'workspace:test' })
    expect(result.current.nodes[0]?.data.content).toBeUndefined()
    await advance(1)
    resolvePending({
      items: [{ id: 'file:a.md', content: 'late', preview: { html: '', math: [] } }],
      revision: 'one',
      truncated: false,
    })
    await advance(10_000)
    expect(result.current.nodes[0]?.data.content).toBeUndefined()
    expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledTimes(2)
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ['workspace-graph-node-details'] })
        .every(
          (query) =>
            !query.state.data || (query.state.data as { items: unknown[] }).items.length === 0,
        ),
    ).toBe(true)
  })

  it('releases placeholder details when the active viewport has no file nodes', async () => {
    vi.mocked(fsApi.getWorkspaceGraphNodeDetails).mockResolvedValue({
      items: [{ id: 'file:a.md', content: 'preview', preview: { html: '', math: [] } }],
      revision: 'one',
      truncated: false,
    })
    const { container, result } = setup(true)
    await advance(100)
    await advance(1)
    expect(result.current.nodes[0]?.data.content).toBe('preview')

    container.querySelector('.react-flow__node')!.remove()
    await advance(100)
    await advance(1)
    expect(result.current.nodes[0]?.data.content).toBeUndefined()
    expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledOnce()
  })

  it('retains overlapping previews across viewport requests and releases them while inactive', async () => {
    vi.mocked(fsApi.getWorkspaceGraphNodeDetails).mockImplementation(async (request) => ({
      items: request.node_ids.map((id) => ({
        id,
        content: id,
        preview: { html: `<p>${id}</p>`, math: [] },
      })),
      revision: request.revision,
      truncated: false,
    }))
    const { container, result, rerender } = setup(true, ['a.md', 'b.md', 'c.md'])
    const layer = container.querySelector('.react-flow__nodes')!
    layer.innerHTML = ['a', 'b']
      .map((id) => `<div class="react-flow__node" data-id="file:${id}.md"></div>`)
      .join('')
    await advance(100)
    await advance(1)
    const first = result.current
    expect(first.nodes[1]?.data.content).toBe('file:b.md')
    layer.innerHTML = ['b', 'c']
      .map((id) => `<div class="react-flow__node" data-id="file:${id}.md"></div>`)
      .join('')
    await advance(100)
    await advance(1)
    const next = result.current
    expect(next.nodes[0]?.data.content).toBeUndefined()
    expect(next.nodes[1]).toBe(first.nodes[1])
    expect(next.nodes[2]?.data.content).toBe('file:c.md')
    expect(fsApi.getWorkspaceGraphNodeDetails).toHaveBeenCalledTimes(2)

    rerender({ active: false, revision: 'one', graphIdentity: 'workspace:test' })
    expect(result.current.nodes[1]?.data.content).toBeUndefined()
    await advance(1)
    rerender({ active: true, revision: 'one', graphIdentity: 'workspace:test' })
    await advance(100)
    await advance(1)
    expect(result.current.nodes[1]?.data.content).toBe('file:b.md')
    expect(result.current.nodes[1]).not.toBe(next.nodes[1])
  })

  it('does not carry previews across workspaces with coinciding revisions', async () => {
    let resolveNext!: (
      value: Awaited<ReturnType<typeof fsApi.getWorkspaceGraphNodeDetails>>,
    ) => void
    vi.mocked(fsApi.getWorkspaceGraphNodeDetails)
      .mockResolvedValueOnce({
        items: [{ id: 'file:a.md', content: 'Old workspace', preview: { html: '', math: [] } }],
        revision: 'one',
        truncated: false,
      })
      .mockReturnValueOnce(new Promise((resolve) => (resolveNext = resolve)))
    const { result, rerender } = setup(true)
    await advance(100)
    await advance(1)
    expect(result.current.nodes[0]?.data.content).toBe('Old workspace')

    rerender({ active: true, revision: 'one', graphIdentity: 'workspace:other' })
    expect(result.current.nodes[0]?.data.content).toBeUndefined()
    await advance(1)
    resolveNext({
      items: [{ id: 'file:a.md', content: 'New workspace', preview: { html: '', math: [] } }],
      revision: 'one',
      truncated: false,
    })
    await advance(1)
    expect(result.current.nodes[0]?.data.content).toBe('New workspace')
  })
})
