import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { useWorkspaceMapViewNavigation } from '@/pages/workspace-map/useWorkspaceMapViewNavigation'
import { navigationHistoryStore } from '@/features/navigation/navigationHistory'

const node = {
  data: { label: 'Home', path: 'notes/Home.md' },
  id: 'file:notes/Home.md',
  position: { x: 0, y: 0 },
  type: 'file',
} satisfies Node<GraphNodeData>

describe('useWorkspaceMapViewNavigation', () => {
  it('restores the viewport that existed before a focused neighborhood', async () => {
    navigationHistoryStore.getState().reset('external:/workspace')
    const viewport = { x: 18, y: 32, zoom: 0.7 }
    const flow = {
      fitView: vi.fn().mockResolvedValue(true),
      getViewport: vi.fn(() => viewport),
      setViewport: vi.fn().mockResolvedValue(true),
    }
    const clearNeighborhood = vi.fn()
    const focusNeighborhoodNode = vi.fn()
    const { result } = renderHook(() =>
      useWorkspaceMapViewNavigation({
        clearNeighborhood,
        flow,
        focusNeighborhoodNode,
        graphIdentity: 'workspace:a',
      }),
    )

    act(() => result.current.focusNode(node))
    act(() => result.current.focusNode({ ...node, id: 'file:notes/Other.md' }))

    expect(flow.getViewport).toHaveBeenCalledOnce()
    expect(focusNeighborhoodNode).toHaveBeenLastCalledWith('file:notes/Other.md')
    expect(flow.fitView).toHaveBeenLastCalledWith(
      expect.objectContaining({ maxZoom: 1, minZoom: 0.35, padding: 0.32 }),
    )

    let exited = false
    await act(async () => {
      exited = result.current.exitFocus()
      await Promise.resolve()
    })

    expect(exited).toBe(true)
    expect(clearNeighborhood).toHaveBeenCalledOnce()
    expect(flow.setViewport).toHaveBeenCalledWith(viewport, { duration: 180 })
    expect(navigationHistoryStore.getState().recent()[0]).toEqual({
      kind: 'graph',
      nodeId: 'workspace',
      viewport,
    })
    expect(result.current.exitFocus()).toBe(false)
  })

  it('fits the complete workspace without animated motion when reduced motion is active', () => {
    const flow = {
      fitView: vi.fn().mockResolvedValue(true),
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
      setViewport: vi.fn().mockResolvedValue(true),
    }
    const { result } = renderHook(() =>
      useWorkspaceMapViewNavigation({
        clearNeighborhood: vi.fn(),
        flow,
        focusNeighborhoodNode: vi.fn(),
        graphIdentity: 'workspace:a',
        reducedMotion: true,
      }),
    )

    act(() => result.current.fitWorkspace())

    expect(flow.fitView).toHaveBeenCalledWith({
      duration: 0,
      maxZoom: 1,
      minZoom: 0.35,
      padding: 0.22,
    })
  })

  it('records the measured viewport after focusing a graph node', async () => {
    navigationHistoryStore.getState().reset('external:/workspace')
    const measuredViewport = { x: 30, y: 40, zoom: 0.8 }
    const flow = {
      fitView: vi.fn().mockResolvedValue(true),
      getViewport: vi.fn(() => measuredViewport),
      setViewport: vi.fn().mockResolvedValue(true),
    }
    const { result } = renderHook(() =>
      useWorkspaceMapViewNavigation({
        clearNeighborhood: vi.fn(),
        flow,
        focusNeighborhoodNode: vi.fn(),
        graphIdentity: 'workspace:a',
        reducedMotion: true,
      }),
    )

    await act(async () => result.current.focusNode(node))

    expect(navigationHistoryStore.getState().recent()).toEqual([
      { kind: 'graph', nodeId: 'notes/Home.md', viewport: measuredViewport },
    ])
  })

  it('does not commit a stale viewport after the cached map becomes inactive', async () => {
    navigationHistoryStore.getState().reset('external:/workspace')
    let finishFit: ((completed: boolean) => void) | undefined
    const fit = new Promise<boolean>((resolve) => {
      finishFit = resolve
    })
    const flow = {
      fitView: vi.fn(() => fit),
      getViewport: vi.fn(() => ({ x: 30, y: 40, zoom: 0.8 })),
      setViewport: vi.fn().mockResolvedValue(true),
    }
    const { result, rerender } = renderHook(
      ({ active }) =>
        useWorkspaceMapViewNavigation({
          active,
          clearNeighborhood: vi.fn(),
          flow,
          focusNeighborhoodNode: vi.fn(),
          graphIdentity: 'workspace:a',
          reducedMotion: true,
        }),
      { initialProps: { active: true } },
    )

    act(() => result.current.focusNode(node))
    rerender({ active: false })
    await act(async () => finishFit?.(true))

    expect(navigationHistoryStore.getState().recent()).toEqual([])
  })
})
