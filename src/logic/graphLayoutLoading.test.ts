import { describe, expect, it, vi } from 'vitest'
import type { Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'

const elkModuleState = vi.hoisted(() => ({ loadCount: 0 }))

vi.mock('elkjs/lib/elk.bundled.js', () => {
  elkModuleState.loadCount += 1

  class TestElk {
    layout = vi.fn(async (graph: { children?: Array<{ id: string }> }) => ({
      ...graph,
      children: graph.children?.map((node, index) => ({
        ...node,
        x: index * 100,
        y: index * 50,
      })),
    }))
  }

  return { default: TestElk }
})

describe('graphLayout loading', () => {
  it('loads ELK only when a non-empty graph needs automatic layout', async () => {
    const { layoutGraphWithElk } = await import('@/logic/graphLayout')

    expect(elkModuleState.loadCount).toBe(0)
    await expect(layoutGraphWithElk([], [])).resolves.toEqual([])
    expect(elkModuleState.loadCount).toBe(0)

    const nodes: Node<GraphNodeData>[] = [
      {
        id: 'heading:first',
        type: 'heading',
        data: { label: 'First' },
        position: { x: 0, y: 0 },
      },
    ]

    await expect(layoutGraphWithElk(nodes, [])).resolves.toMatchObject([
      { position: { x: 0, y: 0 } },
    ])
    expect(elkModuleState.loadCount).toBe(1)
  })
})
