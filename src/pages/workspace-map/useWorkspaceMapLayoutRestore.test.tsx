import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GraphData } from '@/logic/graph'
import { layoutGraphWithElk } from '@/logic/graphLayout'
import { useWorkspaceMapLayout } from '@/pages/workspace-map/useWorkspaceMapLayout'
import { graphLayoutApi } from '@/services/graphLayoutApi'

vi.mock('@/logic/graphLayout', () => ({
  layoutGraphWithElk: vi.fn(async (nodes) =>
    nodes.map((node: GraphData['nodes'][number], index: number) => ({
      ...node,
      position: { x: index * 400, y: index * 100 },
    })),
  ),
}))
vi.mock('@/services/graphLayoutApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/graphLayoutApi')>()
  return {
    ...actual,
    graphLayoutApi: { get: vi.fn(), save: vi.fn(async () => undefined) },
  }
})

const graph: GraphData = {
  edges: [],
  layoutKey: 'revision-a',
  nodes: [
    {
      data: { label: 'A' },
      height: 240,
      id: 'file:a.md',
      position: { x: 0, y: 0 },
      width: 360,
    },
  ],
}

describe('useWorkspaceMapLayout persistence restore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('restores an exact persisted layout before ELK and restores the viewport', async () => {
    vi.mocked(graphLayoutApi.get).mockResolvedValue({
      match: 'exact',
      nodes: [
        {
          collapsed: false,
          height: 420,
          id: 'file:a.md',
          pinned: true,
          userModified: true,
          width: 640,
          x: 120,
          y: 240,
        },
      ],
      viewport: { x: 10, y: 20, zoom: 1.1 },
    })
    const setViewport = vi.fn(async () => true)
    const { result } = renderHook(() => {
      const [nodes, setNodes] = useState(graph.nodes)
      const layout = useWorkspaceMapLayout({
        activePath: null,
        flow: { fitView: vi.fn(), setViewport },
        graph,
        mode: 'overview',
        nodes,
        setNodes,
      })
      return { ...layout, nodes }
    })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(layoutGraphWithElk).not.toHaveBeenCalled()
    expect(result.current.nodes[0]).toMatchObject({
      data: { workspaceMapPinned: true },
      position: { x: 120, y: 240 },
      width: 640,
    })
    await waitFor(() => expect(setViewport).toHaveBeenCalledWith({ x: 10, y: 20, zoom: 1.1 }))
  })

  it('runs ELK on a stale revision then merges stable user overrides and saves the result', async () => {
    vi.mocked(graphLayoutApi.get).mockResolvedValue({
      match: 'stale',
      nodes: [
        {
          collapsed: true,
          height: 420,
          id: 'file:a.md',
          pinned: true,
          userModified: true,
          width: 640,
          x: 120,
          y: 240,
        },
      ],
      viewport: null,
    })
    const { result } = renderHook(() => {
      const [nodes, setNodes] = useState(graph.nodes)
      const layout = useWorkspaceMapLayout({
        activePath: null,
        flow: null,
        graph,
        mode: 'overview',
        nodes,
        setNodes,
      })
      return { ...layout, nodes }
    })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(layoutGraphWithElk).toHaveBeenCalledOnce()
    expect(result.current.nodes[0]).toMatchObject({
      data: { workspaceMapPersistedCollapsed: true, workspaceMapPinned: true },
      position: { x: 120, y: 240 },
    })
    await waitFor(() => expect(graphLayoutApi.save).toHaveBeenCalledOnce())
  })

  it('forces a new automatic layout when arrange is requested', async () => {
    vi.mocked(graphLayoutApi.get).mockResolvedValue({
      match: 'exact',
      nodes: [],
      viewport: null,
    })
    const { result } = renderHook(() => {
      const [nodes, setNodes] = useState(graph.nodes)
      return useWorkspaceMapLayout({
        activePath: null,
        flow: null,
        graph,
        mode: 'overview',
        nodes,
        setNodes,
      })
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.arrange())

    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledOnce())
  })
})
