import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphData } from '@/logic/graph'
import { layoutGraphWithElk } from '@/logic/graphLayout'
import {
  createWorkspaceMapRuntimeLayoutKey,
  useWorkspaceMapLayout,
} from '@/pages/workspace-map/useWorkspaceMapLayout'

type WorkspaceMapFlow = NonNullable<Parameters<typeof useWorkspaceMapLayout>[0]['flow']>

vi.mock('@/logic/graphLayout', () => ({
  layoutGraphWithElk: vi.fn(async (nodes) => nodes),
}))

const createGraph = (activePath: string | null = 'notes/a.md'): GraphData => ({
  nodes: [
    {
      id: 'file:notes/a.md',
      type: 'file',
      data: {
        label: 'A',
        path: 'notes/a.md',
        workspaceMap: true,
        workspaceMapEditor:
          activePath === 'notes/a.md'
            ? {
                active: true,
                loadState: { status: 'ready', content: '# A' },
                onChange: vi.fn(),
                onClose: vi.fn(),
                onOpenFull: vi.fn(),
                onRetry: vi.fn(),
                readOnly: false,
              }
            : undefined,
      },
      position: { x: 0, y: 0 },
    },
    {
      id: 'file:notes/b.md',
      type: 'file',
      data: { label: 'B', path: 'notes/b.md', workspaceMap: true },
      position: { x: 220, y: 0 },
    },
  ],
  edges: [],
  layoutKey: 'map:stable',
})

describe('useWorkspaceMapLayout geometry', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invalidates the worker cache key when runtime editor dimensions change', () => {
    const nodes = createGraph().nodes
    const resized = nodes.map((node) =>
      node.id === 'file:notes/a.md' ? { ...node, height: 620, width: 760 } : node,
    )

    expect(createWorkspaceMapRuntimeLayoutKey('map:active', nodes)).not.toBe(
      createWorkspaceMapRuntimeLayoutKey('map:active', resized),
    )
  })

  it('keeps resized editor geometry while a forced arrange applies new positions', async () => {
    vi.mocked(layoutGraphWithElk)
      .mockImplementationOnce(async (nodes) => nodes)
      .mockImplementationOnce(async (nodes) =>
        nodes.map((node, index) => ({ ...node, position: { x: index * 800, y: 120 } })),
      )
    const graph = createGraph()
    const { result } = renderHook(() => {
      const [nodes, setNodes] = useState(graph.nodes)
      const layout = useWorkspaceMapLayout({
        activePath: 'notes/a.md',
        flow: null,
        graph,
        mode: 'overview',
        nodes,
        setNodes,
      })
      return { ...layout, nodes, setNodes }
    })
    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledOnce())
    act(() =>
      result.current.setNodes((current) =>
        current.map((node) =>
          node.id === 'file:notes/a.md'
            ? {
                ...node,
                height: 620,
                measured: { height: 620, width: 760 },
                style: { ...node.style, height: 620, width: 760 },
                width: 760,
              }
            : node,
        ),
      ),
    )

    act(() => result.current.arrange())

    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(2))
    expect(vi.mocked(layoutGraphWithElk).mock.calls[1]?.[0]?.[0]).toMatchObject({
      height: 620,
      width: 760,
    })
    expect(result.current.nodes[0]).toMatchObject({
      height: 620,
      position: { x: 0, y: 120 },
      width: 760,
    })
    expect(result.current.nodes[1]?.position).toEqual({ x: 800, y: 120 })
  })

  it('uses restored resize geometry when an editor closes and reopens', async () => {
    const activeGraph = createGraph()
    const { result, rerender } = renderHook(
      ({ activePath, graph }) => {
        const [nodes, setNodes] = useState(activeGraph.nodes)
        const layout = useWorkspaceMapLayout({
          activePath,
          flow: null,
          graph,
          mode: 'overview',
          nodes,
          setNodes,
        })
        return { ...layout, nodes, setNodes }
      },
      { initialProps: { activePath: 'notes/a.md' as string | null, graph: activeGraph } },
    )
    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledOnce())
    act(() =>
      result.current.setNodes((current) =>
        current.map((node) =>
          node.id === 'file:notes/a.md'
            ? {
                ...node,
                height: 620,
                measured: { height: 620, width: 760 },
                style: { ...node.style, height: 620, width: 760 },
                width: 760,
              }
            : node,
        ),
      ),
    )

    rerender({ activePath: null, graph: createGraph(null) })
    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(2))
    expect(vi.mocked(layoutGraphWithElk).mock.calls[1]?.[0]?.[0]).toMatchObject({
      height: 620,
      width: 760,
    })
    expect(result.current.nodes[0]).toMatchObject({ height: 620, width: 760 })

    rerender({ activePath: 'notes/a.md', graph: createGraph() })
    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(3))
    expect(vi.mocked(layoutGraphWithElk).mock.calls[2]?.[0]?.[0]).toMatchObject({
      height: 620,
      width: 760,
    })
    expect(result.current.nodes[0]).toMatchObject({ height: 620, width: 760 })
  })

  it('fits a remounted viewport to the arranged position while preserving pin state', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    vi.mocked(layoutGraphWithElk)
      .mockImplementationOnce(async (nodes) => nodes)
      .mockImplementationOnce(async (nodes) =>
        nodes.map((node) => ({ ...node, position: { x: 900, y: 700 } })),
      )
    const fitViewA = vi.fn<WorkspaceMapFlow['fitView']>().mockResolvedValue(true)
    const fitViewB = vi.fn<WorkspaceMapFlow['fitView']>().mockResolvedValue(true)
    const graph = createGraph()
    const { result, rerender } = renderHook(
      ({ flow }) => {
        const [nodes, setNodes] = useState(graph.nodes)
        const layout = useWorkspaceMapLayout({
          activePath: 'notes/a.md',
          flow,
          graph,
          mode: 'overview',
          nodes,
          setNodes,
        })
        return { ...layout, nodes, setNodes }
      },
      { initialProps: { flow: { fitView: fitViewA } as WorkspaceMapFlow } },
    )
    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledOnce())
    act(() =>
      result.current.setNodes((current) =>
        current.map((node) =>
          node.id === 'file:notes/a.md'
            ? {
                ...node,
                data: { ...node.data, workspaceMapPinned: true },
                draggable: false,
                position: { x: 120, y: 80 },
              }
            : node,
        ),
      ),
    )
    act(() => result.current.arrange())
    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(2))

    rerender({ flow: { fitView: fitViewB } })

    await waitFor(() => expect(fitViewB).toHaveBeenCalledOnce())
    expect(fitViewB.mock.calls[0]?.[0]?.nodes?.[0]).toMatchObject({
      data: { workspaceMapPinned: true },
      position: { x: 900, y: 700 },
    })
  })
})
