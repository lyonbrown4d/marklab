import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import {
  hasGraphInteractionSinceLayoutRequest,
  mergeDeferredGraphLayout,
  mergeGraphNodePositions,
} from '@/logic/graphViewState'

type TestNodeData = {
  label: string
}

const createNode = (id: string, x: number, y: number, label = id): Node<TestNodeData> => ({
  id,
  data: { label },
  position: { x, y },
})

describe('mergeGraphNodePositions', () => {
  it('keeps current positions for matching nodes when preserving is enabled', () => {
    const currentNodes = [
      { ...createNode('a', 120, 80), selected: true },
      createNode('b', 240, 160),
    ]
    const nextNodes = [createNode('a', 0, 0, 'Updated'), createNode('b', 10, 10)]

    expect(mergeGraphNodePositions(nextNodes, currentNodes, true)).toEqual([
      {
        ...nextNodes[0],
        position: { x: 120, y: 80 },
        selected: true,
        dragging: undefined,
      },
      {
        ...nextNodes[1],
        position: { x: 240, y: 160 },
        selected: undefined,
        dragging: undefined,
      },
    ])
  })

  it('uses next layout positions when preserving is disabled', () => {
    const currentNodes = [createNode('a', 120, 80)]
    const nextNodes = [createNode('a', 0, 0, 'Updated')]

    expect(mergeGraphNodePositions(nextNodes, currentNodes, false)).toBe(nextNodes)
  })

  it('keeps new nodes at their next layout position', () => {
    const currentNodes = [createNode('a', 120, 80)]
    const nextNodes = [createNode('a', 0, 0), createNode('b', 320, 240)]

    expect(mergeGraphNodePositions(nextNodes, currentNodes, true)[1].position).toEqual({
      x: 320,
      y: 240,
    })
  })
})

describe('mergeDeferredGraphLayout', () => {
  it('preserves a position changed by the user while layout was loading', () => {
    const requestedNodes = [createNode('a', 0, 0)]
    const currentNodes = [{ ...createNode('a', 160, 90), dragging: true }]
    const layoutNodes = [createNode('a', 320, 180)]

    expect(mergeDeferredGraphLayout(layoutNodes, currentNodes, requestedNodes)).toEqual([
      {
        ...layoutNodes[0],
        position: { x: 160, y: 90 },
        selected: undefined,
        dragging: true,
      },
    ])
  })

  it('applies the deferred layout when the current position is unchanged', () => {
    const requestedNodes = [createNode('a', 0, 0)]
    const currentNodes = [{ ...createNode('a', 0, 0), selected: true }]
    const layoutNodes = [createNode('a', 320, 180)]

    expect(mergeDeferredGraphLayout(layoutNodes, currentNodes, requestedNodes)).toEqual([
      {
        ...layoutNodes[0],
        selected: true,
        dragging: undefined,
      },
    ])
  })
})

describe('hasGraphInteractionSinceLayoutRequest', () => {
  it('detects position changes and active dragging', () => {
    const requestedNodes = [createNode('a', 0, 0)]

    expect(hasGraphInteractionSinceLayoutRequest([createNode('a', 0, 0)], requestedNodes)).toBe(
      false,
    )
    expect(hasGraphInteractionSinceLayoutRequest([createNode('a', 5, 0)], requestedNodes)).toBe(
      true,
    )
    expect(
      hasGraphInteractionSinceLayoutRequest(
        [{ ...createNode('a', 0, 0), dragging: true }],
        requestedNodes,
      ),
    ).toBe(true)
  })
})
