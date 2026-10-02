import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'

const workerState = vi.hoisted(() => ({
  layout: vi.fn(),
  warmup: vi.fn(),
}))

vi.mock('@/logic/graphLayoutWorkerClient', () => ({
  graphLayoutWorkerClient: workerState,
}))

describe('graphLayout loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workerState.layout.mockImplementation(async (graph: { children: Array<{ id: string }> }) =>
      graph.children.map((node, index) => ({ id: node.id, x: index * 100, y: index * 50 })),
    )
  })

  it('starts the worker only when a non-empty graph needs automatic layout', async () => {
    const { layoutGraphWithElk } = await import('@/logic/graphLayout')

    await expect(layoutGraphWithElk([], [])).resolves.toEqual([])
    expect(workerState.layout).not.toHaveBeenCalled()

    const onOpenFull = vi.fn()
    const nodes: Node<GraphNodeData>[] = [
      {
        id: 'heading:first',
        type: 'heading',
        data: {
          label: 'First',
          workspaceMapEditor: {
            active: true,
            loadState: { status: 'ready', content: 'Content' },
            onChange: vi.fn(),
            onClose: vi.fn(),
            onOpenFull,
            onRetry: vi.fn(),
            readOnly: false,
          },
        },
        position: { x: 0, y: 0 },
      },
    ]

    await expect(layoutGraphWithElk(nodes, [])).resolves.toMatchObject([
      { position: { x: 0, y: 0 } },
    ])
    expect(workerState.layout).toHaveBeenCalledOnce()
    expect(workerState.layout.mock.calls[0]?.[0].children).toEqual([
      expect.objectContaining({ id: 'heading:first', width: expect.any(Number) }),
    ])
    expect(workerState.layout.mock.calls[0]?.[0].children[0]).not.toHaveProperty('data')
  })

  it('reuses a pure layout result by layout key without retaining stale node data', async () => {
    const { layoutGraphWithElk } = await import('@/logic/graphLayout')
    const firstNodes: Node<GraphNodeData>[] = [
      {
        id: 'heading:first',
        type: 'heading',
        data: { label: 'Before' },
        position: { x: 0, y: 0 },
      },
    ]

    const first = await layoutGraphWithElk(firstNodes, [], { layoutKey: 'workspace:one' })
    const second = await layoutGraphWithElk(
      firstNodes.map((node) => ({ ...node, data: { ...node.data, label: 'After' } })),
      [],
      { layoutKey: 'workspace:one' },
    )

    expect(workerState.layout).toHaveBeenCalledOnce()
    expect(first[0]?.data.label).toBe('Before')
    expect(second[0]?.data.label).toBe('After')
  })

  it('evicts old layouts from the bounded cache', async () => {
    const { layoutGraphWithElk } = await import('@/logic/graphLayout')
    const nodes: Node<GraphNodeData>[] = [
      {
        id: 'heading:first',
        type: 'heading',
        data: { label: 'First' },
        position: { x: 0, y: 0 },
      },
    ]

    for (let index = 0; index < 9; index += 1) {
      await layoutGraphWithElk(nodes, [], { layoutKey: `bounded:${index}` })
    }
    await layoutGraphWithElk(nodes, [], { layoutKey: 'bounded:0' })

    expect(workerState.layout).toHaveBeenCalledTimes(10)
  })
})
