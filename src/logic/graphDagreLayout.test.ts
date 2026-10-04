import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
import type { GraphNodeData } from '@/logic/graph'
import { applyDagreLayout, type DagreLayoutOptions } from '@/logic/graphDagreLayout'

const options: DagreLayoutOptions = { rankdir: 'LR', ranksep: 180, nodesep: 54 }

const createNodes = (): Node<GraphNodeData>[] =>
  ['source', 'first', 'second', 'third'].map((id) => ({
    id,
    type: 'file',
    data: { label: id, path: `${id}.md` },
    position: { x: 0, y: 0 },
  }))

const edges: Edge[] = [
  { id: 'first', source: 'source', target: 'first' },
  { id: 'second-1', source: 'source', target: 'second' },
  { id: 'second-2', source: 'source', target: 'second' },
  { id: 'second-3', source: 'source', target: 'second' },
  { id: 'third', source: 'source', target: 'third' },
]

describe('applyDagreLayout', () => {
  it('submits one layout edge per endpoint pair without mutating graph links', () => {
    const nodes = createNodes()
    let layoutEdgeCount = 0

    applyDagreLayout(nodes, edges, options, (graph) => {
      layoutEdgeCount = graph.edgeCount()
      graph.nodes().forEach((id, index) => {
        Object.assign(graph.node(id), { x: index * 100, y: index * 50 })
      })
    })

    expect(layoutEdgeCount).toBe(3)
    expect(edges).toHaveLength(5)
  })

  it('falls back to distinct grid positions when Dagre throws', () => {
    const nodes = createNodes()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    applyDagreLayout(nodes, edges, options, () => {
      throw new Error('Not possible to find intersection inside of the rectangle')
    })

    expect(new Set(nodes.map((node) => `${node.position.x}:${node.position.y}`)).size).toBe(
      nodes.length,
    )
    expect(warning).toHaveBeenCalledWith('Dagre graph layout failed.', expect.any(Error))
    warning.mockRestore()
  })

  it('lays out a large workspace graph with repeated links without invalid positions', () => {
    const nodes: Node<GraphNodeData>[] = Array.from({ length: 635 }, (_, index) => ({
      id: `file:${index}`,
      type: 'file',
      data: { label: `Document ${index}`, path: `docs/${index}.md` },
      position: { x: 0, y: 0 },
    }))
    const edges: Edge[] = Array.from({ length: 871 }, (_, index) => ({
      id: `link:${index}`,
      source: `file:${index % 320}`,
      target: `file:${(index * 7 + 1) % 335}`,
    }))

    const synchronousLayout = vi.fn()

    expect(() => applyDagreLayout(nodes, edges, options, synchronousLayout)).not.toThrow()
    expect(synchronousLayout).not.toHaveBeenCalled()
    expect(edges).toHaveLength(871)
    expect(
      nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y)),
    ).toBe(true)
    expect(
      new Set(nodes.map((node) => `${node.position.x}:${node.position.y}`)).size,
    ).toBeGreaterThan(1)
  })
})
