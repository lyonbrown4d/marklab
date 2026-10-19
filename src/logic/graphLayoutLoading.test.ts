import { afterEach, expect, it, vi } from 'vitest'
import type { Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
const layout = vi.hoisted(() => vi.fn())
vi.mock('@/services/graphComputeApi', () => ({ graphComputeApi: { layout } }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
it('imports without computing and uses native layout on demand without a JavaScript Worker', async () => {
  const Worker = vi.fn()
  vi.stubGlobal('Worker', Worker)
  const { layoutGraphNative } = await import('@/logic/graphLayout')
  expect(layout).not.toHaveBeenCalled()
  await layoutGraphNative([], [])
  expect(layout).not.toHaveBeenCalled()
  layout.mockResolvedValue({
    engineVersion: 'native-workspace-map-v1',
    positions: [{ id: 'a', x: 12, y: 24 }],
  })
  const nodes: Node<GraphNodeData>[] = [
    { id: 'a', data: { label: 'Current' }, position: { x: 0, y: 0 } },
  ]
  const result = await layoutGraphNative(nodes, [], { layoutKey: 'same' })
  const updated = { ...nodes[0]!, data: { label: 'Updated' } }
  const next = await layoutGraphNative([updated], [], { layoutKey: 'same' })
  expect(layout).toHaveBeenCalledTimes(2)
  expect(result[0]?.data).toBe(nodes[0]?.data)
  expect(next[0]?.data).toBe(updated.data)
  expect(Worker).not.toHaveBeenCalled()
})
