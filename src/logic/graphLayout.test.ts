import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { layoutGraphNative } from '@/logic/graphLayout'
import { getGraphNodeLayoutSize } from '@/logic/graphLayoutMetrics'
import { graphComputeApi } from '@/services/graphComputeApi'

vi.mock('@/services/graphComputeApi', () => ({ graphComputeApi: { layout: vi.fn() } }))
const node = (id: string, data: Partial<GraphNodeData> = {}): Node<GraphNodeData> => ({
  id,
  type: 'file',
  data: { label: id, ...data },
  position: { x: 0, y: 0 },
})

describe('native graph layout renderer boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(graphComputeApi.layout).mockResolvedValue({
      engineVersion: 'native-workspace-map-v1',
      positions: [
        { id: 'b', x: 90, y: 120 },
        { id: 'a', x: 30, y: 60 },
      ],
    })
  })
  it('sends dimensions and known topology, preserving renderer data and node order', async () => {
    const onChange = vi.fn()
    const a = node('a', {
      content: 'Private text',
      onUpdateContent: onChange,
      workspaceGroup: { key: 'docs', label: 'Docs', source: 'path' },
    })
    const b = { ...node('b'), width: 610, height: 430 }
    const edges: Edge[] = [
      { id: 'ab', source: 'a', target: 'b', data: { text: 'Private edge' } },
      { id: 'unknown-target', source: 'a', target: 'missing' },
      { id: 'unknown-source', source: 'missing', target: 'b' },
    ]
    const result = await layoutGraphNative([a, b], edges)
    expect(graphComputeApi.layout).toHaveBeenCalledWith(
      {
        mode: 'focus',
        nodes: [
          { id: 'a', ...getGraphNodeLayoutSize(a) },
          { id: 'b', width: 610, height: 430 },
        ],
        edges: [{ source: 'a', target: 'b' }],
      },
      undefined,
    )
    expect(result.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: 'a', position: { x: 30, y: 60 } },
      { id: 'b', position: { x: 90, y: 120 } },
    ])
    expect(result[0]?.data).toBe(a.data)
    expect(result[0]?.data.onUpdateContent).toBe(onChange)
    expect(result[1]).toMatchObject({ width: 610, height: 430 })
    expect(a.position).toEqual({ x: 0, y: 0 })
  })
  it('sends overview group identifiers without labels or reference edges', async () => {
    const a = node('a', {
      workspaceMapMode: 'overview',
      workspaceGroup: { key: 'group:a', label: 'Private group label', source: 'semantic' },
    })
    const b = node('b', { workspaceMapMode: 'overview' })
    await layoutGraphNative([a, b], [{ id: 'ab', source: 'a', target: 'b' }])
    expect(graphComputeApi.layout).toHaveBeenCalledWith(
      {
        mode: 'overview',
        nodes: [
          { id: 'a', ...getGraphNodeLayoutSize(a), group: 'group:a' },
          { id: 'b', ...getGraphNodeLayoutSize(b) },
        ],
        edges: [],
      },
      undefined,
    )
  })
  it('does not compute empty or already-cancelled input', async () => {
    const empty: Node<GraphNodeData>[] = []
    expect(await layoutGraphNative(empty, [])).toBe(empty)
    await expect(
      layoutGraphNative([node('a')], [], { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(graphComputeApi.layout).not.toHaveBeenCalled()
  })
  it.each([
    { name: 'missing', ids: ['a'] },
    { name: 'duplicate replacing a node', ids: ['a', 'a'] },
    { name: 'unrelated', ids: ['a', 'other'] },
    { name: 'extra', ids: ['a', 'b', 'other'] },
    { name: 'duplicate extra coordinate', ids: ['a', 'b', 'b'] },
  ])('rejects $name positions', async ({ ids }) => {
    vi.mocked(graphComputeApi.layout).mockResolvedValueOnce({
      engineVersion: 'native-workspace-map-v1',
      positions: ids.map((id) => ({ id, x: 1, y: 2 })),
    })
    await expect(layoutGraphNative([node('a'), node('b')], [])).rejects.toThrow(
      'incomplete positions',
    )
  })
  it('passes cancellation through and preserves native failure identity', async () => {
    const signal = new AbortController().signal
    const failure = new Error('Native layout failed')
    vi.mocked(graphComputeApi.layout).mockRejectedValueOnce(failure)
    await expect(layoutGraphNative([node('a')], [], { signal })).rejects.toBe(failure)
    expect(graphComputeApi.layout).toHaveBeenCalledWith(expect.any(Object), signal)
    const abort = new DOMException('Cancelled', 'AbortError')
    vi.mocked(graphComputeApi.layout).mockRejectedValueOnce(abort)
    await expect(layoutGraphNative([node('a')], [])).rejects.toBe(abort)
  })
})
