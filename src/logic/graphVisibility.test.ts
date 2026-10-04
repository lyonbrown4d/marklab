import type { Edge } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import {
  buildContainsChildrenMap,
  buildDescendantCountMap,
  getDescendants,
  getHiddenNodeIds,
  getVisibleGraphElements,
  isContainsEdge,
  getSelectionAfterBranchCollapse,
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

  it('computes branch sizes once and protects against accidental cycles', () => {
    const children = new Map([
      ['root', ['child']],
      ['child', ['leaf']],
      ['leaf', ['root']],
    ])

    expect(buildDescendantCountMap(children)).toEqual(
      new Map([
        ['root', 2],
        ['child', 2],
        ['leaf', 2],
      ]),
    )
  })

  it('counts unique descendants for duplicate edges and shared DAG children', () => {
    const children = buildContainsChildrenMap([
      createEdge('root-a', 'root', 'a', 'contains'),
      createEdge('root-a-again', 'root', 'a', 'contains'),
      createEdge('root-b', 'root', 'b', 'contains'),
      createEdge('a-leaf', 'a', 'leaf', 'contains'),
      createEdge('b-leaf', 'b', 'leaf', 'contains'),
    ])

    expect(children.get('root')).toEqual(['a', 'b'])
    expect(buildDescendantCountMap(children)).toEqual(
      new Map([
        ['root', 3],
        ['a', 1],
        ['b', 1],
      ]),
    )
  })

  it('moves a hidden descendant selection to the collapsed branch', () => {
    const children = new Map([
      ['root', ['child']],
      ['child', ['leaf']],
    ])

    expect(getSelectionAfterBranchCollapse('leaf', 'root', children)).toBe('root')
    expect(getSelectionAfterBranchCollapse('sibling', 'root', children)).toBe('sibling')
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
