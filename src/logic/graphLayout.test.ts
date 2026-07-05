import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { getGraphNodeLayoutSize, layoutGraphWithElk } from '@/logic/graphLayout'
import type { GraphNodeData } from '@/logic/graph'

const node = (
  id: string,
  data: Partial<GraphNodeData> = {},
  type: Node<GraphNodeData>['type'] = 'heading',
): Node<GraphNodeData> => ({
  id,
  type,
  data: {
    label: id,
    ...data,
  },
  position: { x: 0, y: 0 },
})

const overlaps = (left: Node<GraphNodeData>, right: Node<GraphNodeData>) => {
  const leftSize = getGraphNodeLayoutSize(left)
  const rightSize = getGraphNodeLayoutSize(right)
  return !(
    left.position.x + leftSize.width <= right.position.x ||
    right.position.x + rightSize.width <= left.position.x ||
    left.position.y + leftSize.height <= right.position.y ||
    right.position.y + rightSize.height <= left.position.y
  )
}

describe('graphLayout', () => {
  it('uses larger layout boxes for content-rich heading nodes', () => {
    const compact = node('heading:compact')
    const full = node('heading:full', {
      contentMode: 'full',
      contentBlocks: [
        { id: 'code', kind: 'code', language: 'ts', text: 'const value = 1', editable: false },
        { id: 'quote', kind: 'blockquote', text: 'Quoted context', editable: false },
      ],
    })

    expect(getGraphNodeLayoutSize(full).width).toBeGreaterThan(
      getGraphNodeLayoutSize(compact).width,
    )
    expect(getGraphNodeLayoutSize(full).height).toBeGreaterThan(
      getGraphNodeLayoutSize(compact).height,
    )
  })

  it('lays out variable-size graph nodes without bounding-box overlap', async () => {
    const nodes = [
      node('file:root', {}, 'file'),
      node('heading:large', {
        contentMode: 'full',
        contentBlocks: [
          { id: 'code', kind: 'code', language: 'ts', text: 'const value = 1', editable: false },
          {
            id: 'list',
            kind: 'list',
            ordered: false,
            items: ['One', 'Two', 'Three'],
            editable: false,
          },
          { id: 'quote', kind: 'blockquote', text: 'Quoted context', editable: false },
        ],
      }),
      node('heading:sibling', { contentMode: 'summary', content: 'Summary text' }),
      node('preview:asset', {}, 'preview'),
    ]
    const edges: Edge[] = [
      { id: 'root-large', source: 'file:root', target: 'heading:large' },
      { id: 'root-sibling', source: 'file:root', target: 'heading:sibling' },
      { id: 'large-preview', source: 'heading:large', target: 'preview:asset' },
    ]

    const layoutNodes = await layoutGraphWithElk(nodes, edges)

    layoutNodes.forEach((current, index) => {
      layoutNodes.slice(index + 1).forEach((next) => {
        expect(overlaps(current, next)).toBe(false)
      })
    })
  })
})
