import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GraphData } from '@/logic/graph'
import { useWorkspaceMapLayoutPersistence } from '@/pages/workspace-map/useWorkspaceMapLayoutPersistence'
import { graphLayoutApi, type GraphLayoutRequest } from '@/services/graphLayoutApi'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'

vi.mock('@/services/graphLayoutApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/graphLayoutApi')>()
  return { ...actual, graphLayoutApi: { ...actual.graphLayoutApi, save: vi.fn() } }
})

const request: GraphLayoutRequest = {
  engineVersion: 'elk-workspace-map-v1',
  graphRevision: 'revision-a',
  layoutKey: 'workspace-map:overview',
  mode: 'overview',
}
const nodes: GraphData['nodes'] = [
  {
    data: { label: 'A' },
    height: 240,
    id: 'file:a.md',
    position: { x: 10, y: 20 },
    width: 360,
  },
]

describe('useWorkspaceMapLayoutPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(graphLayoutApi.save).mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('debounces node and viewport changes into one batched save', async () => {
    const flow = { getViewport: () => ({ x: 3, y: 4, zoom: 1.1 }) }
    const { result, rerender } = renderHook(
      ({ currentNodes }) =>
        useWorkspaceMapLayoutPersistence({
          enabled: true,
          flow,
          nodes: currentNodes,
          request,
        }),
      { initialProps: { currentNodes: nodes } },
    )

    rerender({ currentNodes: [{ ...nodes[0], position: { x: 100, y: 200 } }] })
    act(() => result.current.scheduleViewportSave())
    await act(async () => vi.advanceTimersByTimeAsync(320))

    expect(graphLayoutApi.save).toHaveBeenCalledOnce()
    expect(graphLayoutApi.save).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [expect.objectContaining({ x: 100, y: 200 })],
        viewport: { x: 3, y: 4, zoom: 1.1 },
      }),
    )
  })

  it('flushes pending persistence when the canvas unmounts', async () => {
    const { unmount } = renderHook(() =>
      useWorkspaceMapLayoutPersistence({
        enabled: true,
        flow: { getViewport: () => ({ x: 0, y: 0, zoom: 1 }) },
        nodes,
        request,
      }),
    )

    unmount()
    await act(async () => Promise.resolve())

    expect(graphLayoutApi.save).toHaveBeenCalledOnce()
  })

  it('flushes the previous layout before switching persistence requests', async () => {
    const nextRequest: GraphLayoutRequest = {
      ...request,
      graphRevision: 'revision-b',
      layoutKey: 'workspace-map:focus',
      mode: 'focus',
    }
    const { rerender } = renderHook(
      ({ currentRequest }) =>
        useWorkspaceMapLayoutPersistence({
          enabled: true,
          flow: { getViewport: () => ({ x: 0, y: 0, zoom: 1 }) },
          nodes,
          request: currentRequest,
        }),
      { initialProps: { currentRequest: request } },
    )

    rerender({ currentRequest: nextRequest })
    await act(async () => Promise.resolve())

    expect(graphLayoutApi.save).toHaveBeenCalledOnce()
    expect(graphLayoutApi.save).toHaveBeenCalledWith(
      expect.objectContaining({ graphRevision: 'revision-a', layoutKey: 'workspace-map:overview' }),
    )
    await act(async () => vi.advanceTimersByTimeAsync(320))
    expect(graphLayoutApi.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ graphRevision: 'revision-b', layoutKey: 'workspace-map:focus' }),
    )
  })

  it('reports persistence failures through renderer diagnostics', async () => {
    const error = new Error('disk full')
    const report = vi.spyOn(rendererDiagnostics, 'error').mockImplementation(() => undefined)
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.mocked(graphLayoutApi.save).mockRejectedValueOnce(error)

    renderHook(() =>
      useWorkspaceMapLayoutPersistence({
        enabled: true,
        flow: { getViewport: () => ({ x: 0, y: 0, zoom: 1 }) },
        nodes,
        request,
      }),
    )
    await act(async () => vi.advanceTimersByTimeAsync(320))

    expect(report).toHaveBeenCalledWith('workspace-map.layout', 'persistence-failed', error)
    expect(warning).toHaveBeenCalledWith('Workspace map layout persistence failed.', error)
  })

  it('drops an invalid viewport instead of persisting non-finite coordinates', async () => {
    renderHook(() =>
      useWorkspaceMapLayoutPersistence({
        enabled: true,
        flow: { getViewport: () => ({ x: Number.NaN, y: 0, zoom: 1 }) },
        nodes,
        request,
      }),
    )

    await act(async () => vi.advanceTimersByTimeAsync(320))
    expect(graphLayoutApi.save).toHaveBeenCalledWith(expect.objectContaining({ viewport: null }))
  })
})
