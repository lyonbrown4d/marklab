import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import {
  getFirstChildHeadingId,
  getNextHeadingId,
  getParentHeadingId,
  getPreviousHeadingId,
} from '@/logic/graphKeyboardNavigation'

const nodes: Node<GraphNodeData>[] = [
  {
    id: 'file:notes/current.md',
    data: { label: 'current.md' },
    position: { x: 0, y: 0 },
  },
  {
    id: 'heading:notes/current.md:intro',
    type: 'heading',
    data: { label: 'Intro', line: 1 },
    position: { x: 0, y: 0 },
  },
  {
    id: 'heading:notes/current.md:child',
    type: 'heading',
    data: { label: 'Child', line: 2 },
    position: { x: 0, y: 0 },
  },
  {
    id: 'heading:notes/current.md:next',
    type: 'heading',
    data: { label: 'Next', line: 5 },
    position: { x: 0, y: 0 },
  },
]

const edges: Edge[] = [
  {
    id: 'file:notes/current.md->heading:notes/current.md:intro-0',
    source: 'file:notes/current.md',
    target: 'heading:notes/current.md:intro',
  },
  {
    id: 'heading:notes/current.md:intro->heading:notes/current.md:child-1',
    source: 'heading:notes/current.md:intro',
    target: 'heading:notes/current.md:child',
  },
  {
    id: 'file:notes/current.md->heading:notes/current.md:next-2',
    source: 'file:notes/current.md',
    target: 'heading:notes/current.md:next',
  },
]

describe('graph keyboard navigation', () => {
  it('navigates headings by markdown line order', () => {
    expect(getPreviousHeadingId(nodes, 'heading:notes/current.md:child')).toBe(
      'heading:notes/current.md:intro',
    )
    expect(getNextHeadingId(nodes, 'heading:notes/current.md:child')).toBe(
      'heading:notes/current.md:next',
    )
  })

  it('navigates heading parent and first child through graph edges', () => {
    expect(getParentHeadingId(nodes, edges, 'heading:notes/current.md:child')).toBe(
      'heading:notes/current.md:intro',
    )
    expect(getParentHeadingId(nodes, edges, 'heading:notes/current.md:intro')).toBeNull()
    expect(getFirstChildHeadingId(nodes, edges, 'heading:notes/current.md:intro')).toBe(
      'heading:notes/current.md:child',
    )
  })
})
