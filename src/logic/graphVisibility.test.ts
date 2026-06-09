import type { Edge } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import {
  buildContainsChildrenMap,
  getDescendants,
  getHiddenNodeIds,
  getVisibleGraphElements,
  isContainsEdge,
} from '@/logic/graphVisibility'

const createNode = (id: string): Parameters<typeof getHiddenNodeIds>[0][number] =>
  ({
    id,
    position: { x: 0, y: 0 },
    data: { label: id },
  }) as Parameters<typeof getHiddenNodeIds>[0][number]

const createEdge = (id: string, source: string, target: string, kind?: string): Edge => ({
  id,
  source,
  target,
  ...(kind ? { data: { kind } } : {}),
})

describe('graphVisibility', () => {
  it('recognizes contains edges without treating reference edges as contains', () => {
    expect(
      isContainsEdge(createEdge('contains', 'heading:parent', 'heading:child', 'contains')),
    ).toBe(true)
    expect(isContainsEdge(createEdge('heading-fallback', 'heading:a', 'heading:b'))).toBe(true)
    expect(
      isContainsEdge(createEdge('reference', 'heading:parent', 'heading:ref', 'reference')),
    ).toBe(false)
    expect(isContainsEdge(createEdge('plain', 'node:a', 'node:b'))).toBe(false)
  })

  it('calculates descendants from contains child relationships recursively', () => {
    const childrenByParent = buildContainsChildrenMap([
      createEdge('root-child', 'heading:root', 'heading:child', 'contains'),
      createEdge('child-grandchild', 'heading:child', 'heading:grandchild', 'contains'),
      createEdge('root-reference', 'heading:root', 'heading:ref', 'reference'),
    ])

    expect(getDescendants(['heading:root'], childrenByParent)).toEqual(
      new Set(['heading:child', 'heading:grandchild']),
    )
  })

  it('hides only descendants of a collapsed node and keeps the collapsed node visible', () => {
    const nodes = [
      createNode('heading:root'),
      createNode('heading:child'),
      createNode('heading:grandchild'),
      createNode('heading:sibling'),
    ]
    const edges = [
      createEdge('root-child', 'heading:root', 'heading:child', 'contains'),
      createEdge('child-grandchild', 'heading:child', 'heading:grandchild', 'contains'),
      createEdge('root-sibling-reference', 'heading:root', 'heading:sibling', 'reference'),
      createEdge(
        'sibling-grandchild-reference',
        'heading:sibling',
        'heading:grandchild',
        'reference',
      ),
    ]

    const hiddenNodeIds = getHiddenNodeIds(
      nodes,
      new Set(['heading:root']),
      buildContainsChildrenMap(edges),
    )
    const visibleElements = getVisibleGraphElements(nodes, edges, hiddenNodeIds)

    expect(hiddenNodeIds).toEqual(new Set(['heading:child', 'heading:grandchild']))
    expect(hiddenNodeIds.has('heading:root')).toBe(false)
    expect(visibleElements.visibleNodes.map((node) => node.id)).toEqual([
      'heading:root',
      'heading:sibling',
    ])
    expect(visibleElements.visibleEdges.map((edge) => edge.id)).toEqual(['root-sibling-reference'])
  })

  it('does not use non-contains reference edges as parent-child relationships', () => {
    const nodes = [
      createNode('heading:root'),
      createNode('heading:child'),
      createNode('heading:referenced'),
    ]
    const edges = [
      createEdge('root-child', 'heading:root', 'heading:child', 'contains'),
      createEdge('root-referenced', 'heading:root', 'heading:referenced', 'reference'),
    ]

    expect(
      getHiddenNodeIds(nodes, new Set(['heading:root']), buildContainsChildrenMap(edges)),
    ).toEqual(new Set(['heading:child']))
  })

  it('ignores collapsed ids that do not exist in the node list', () => {
    const nodes = [createNode('heading:child')]
    const childrenByParent = new Map([['heading:missing', ['heading:child']]])

    expect(getHiddenNodeIds(nodes, new Set(['heading:missing']), childrenByParent)).toEqual(
      new Set(),
    )
  })
})
