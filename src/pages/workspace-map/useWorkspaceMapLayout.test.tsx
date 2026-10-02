import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphData } from '@/logic/graph'
import { useWorkspaceMapLayout } from '@/pages/workspace-map/useWorkspaceMapLayout'
import { layoutGraphWithElk } from '@/logic/graphLayout'

type WorkspaceMapFlow = NonNullable<Parameters<typeof useWorkspaceMapLayout>[0]['flow']>

vi.mock('@/logic/graphLayout', () => ({
  layoutGraphWithElk: vi.fn(async (nodes) => nodes),
}))

const createGraph = (activePath: string | null, value = ''): GraphData => ({
  nodes: ['notes/a.md', 'notes/b.md'].map((path) => ({
    id: `file:${path}`,
    type: 'file',
    data: {
      label: path,
      path,
      workspaceMapEditor:
        path === activePath
          ? {
              active: true,
              loadState: { status: 'ready' as const, content: value },
              onChange: vi.fn(),
              onClose: vi.fn(),
              onOpenFull: vi.fn(),
              onRetry: vi.fn(),
              readOnly: false,
            }
          : undefined,
    },
    position: { x: 0, y: 0 },
  })),
  edges: [],
  layoutKey: `map:editor:${activePath ?? ''}`,
})

describe('useWorkspaceMapLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
  })

  it('keeps nodes hidden until asynchronous layout is ready', async () => {
    let resolveLayout: (nodes: GraphData['nodes']) => void = () => undefined
    vi.mocked(layoutGraphWithElk).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLayout = resolve
        }),
    )
    const setNodes = vi.fn()
    const graph = createGraph(null)
    const { result } = renderHook(() =>
      useWorkspaceMapLayout({ activePath: null, flow: null, graph, setNodes }),
    )

    expect(result.current.status).toBe('loading')
    expect(setNodes).not.toHaveBeenCalled()
    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledOnce())

    await act(async () => {
      resolveLayout(
        graph.nodes.map((node, index) => ({
          ...node,
          position: { x: index * 240, y: 80 },
        })),
      )
    })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(setNodes).toHaveBeenCalledOnce()
    expect(setNodes.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ position: { x: 0, y: 80 } }),
      expect.objectContaining({ position: { x: 240, y: 80 } }),
    ])
  })

  it('exposes layout failures instead of leaving the map in loading state', async () => {
    const error = new Error('layout failed')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.mocked(layoutGraphWithElk)
      .mockRejectedValueOnce(error)
      .mockImplementationOnce(async (nodes) => nodes)
    const setNodes = vi.fn()
    const { result } = renderHook(() =>
      useWorkspaceMapLayout({
        activePath: null,
        flow: null,
        graph: createGraph(null),
        setNodes,
      }),
    )

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(warn).toHaveBeenCalledWith('Workspace map layout failed.', error)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(layoutGraphWithElk).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('relayouts once per active path and fits only the active editor node', async () => {
    const fitViewA = vi.fn<WorkspaceMapFlow['fitView']>().mockResolvedValue(true)
    const fitViewB = vi.fn<WorkspaceMapFlow['fitView']>().mockResolvedValue(true)
    const flowA: WorkspaceMapFlow = { fitView: fitViewA }
    const flowB: WorkspaceMapFlow = { fitView: fitViewB }
    const setNodes = vi.fn()
    const { result, rerender } = renderHook(
      ({ activePath, flow, graph }) =>
        useWorkspaceMapLayout({
          activePath,
          flow,
          graph,
          setNodes,
        }),
      {
        initialProps: {
          activePath: 'notes/a.md' as string | null,
          flow: flowA,
          graph: createGraph('notes/a.md'),
        },
      },
    )

    await waitFor(() => expect(fitViewA).toHaveBeenCalledOnce())
    expect(result.current.status).toBe('ready')
    expect(fitViewA.mock.calls[0]?.[0]).toMatchObject({
      nodes: [expect.objectContaining({ id: 'file:notes/a.md' })],
    })

    rerender({ activePath: 'notes/a.md', flow: flowA, graph: createGraph('notes/a.md', 'typed') })
    expect(layoutGraphWithElk).toHaveBeenCalledOnce()

    const nextGraph = createGraph('notes/b.md')
    rerender({ activePath: 'notes/b.md', flow: flowA, graph: nextGraph })
    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(2))
    expect(fitViewA).toHaveBeenCalledOnce()

    rerender({ activePath: 'notes/b.md', flow: flowB, graph: nextGraph })
    await waitFor(() => expect(fitViewB).toHaveBeenCalledOnce())
    expect(fitViewB.mock.calls[0]?.[0]).toMatchObject({
      nodes: [expect.objectContaining({ id: 'file:notes/b.md' })],
    })
  })

  it('fits only the new flow instance after a loading remount', async () => {
    let resolveLayout: (nodes: GraphData['nodes']) => void = () => undefined
    const fitViewA = vi.fn<WorkspaceMapFlow['fitView']>().mockResolvedValue(true)
    const fitViewB = vi.fn<WorkspaceMapFlow['fitView']>().mockResolvedValue(true)
    const flowA: WorkspaceMapFlow = { fitView: fitViewA }
    const flowB: WorkspaceMapFlow = { fitView: fitViewB }
    const setNodes = vi.fn()
    const firstGraph = createGraph('notes/a.md')
    const nextGraph = createGraph('notes/b.md')
    const { result, rerender } = renderHook(
      ({ activePath, flow, graph }) => useWorkspaceMapLayout({ activePath, flow, graph, setNodes }),
      { initialProps: { activePath: 'notes/a.md', flow: flowA, graph: firstGraph } },
    )

    await waitFor(() => expect(fitViewA).toHaveBeenCalledOnce())
    vi.mocked(layoutGraphWithElk).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLayout = resolve
        }),
    )
    rerender({ activePath: 'notes/b.md', flow: flowA, graph: nextGraph })
    await waitFor(() => expect(result.current.status).toBe('loading'))

    await act(async () => resolveLayout(nextGraph.nodes))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(fitViewA).toHaveBeenCalledOnce()

    rerender({ activePath: 'notes/b.md', flow: flowB, graph: nextGraph })
    await waitFor(() => expect(fitViewB).toHaveBeenCalledOnce())
    expect(fitViewA).toHaveBeenCalledOnce()
  })
})
