import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import {
  applyMindmapSelection,
  buildMindmapModel,
  getMindmapVisibility,
  resolveMindmapDropIntent,
} from '@/pages/graph/mindmapModel'

const node = (id: string, line: number, x: number, y: number): Node<GraphNodeData> => ({
  id,
  type: 'heading',
  data: { label: id, line, level: line === 1 ? 1 : 2 },
  position: { x, y },
  measured: { width: 180, height: 56 },
})
const edge = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  data: { kind: 'contains' },
})

describe('mindmap model', () => {
  it('preserves the nodes array when React Flow repeats an unchanged selection', () => {
    const nodes = [node('root', 1, 0, 0), node('child', 2, 220, 0)]
    expect(applyMindmapSelection(nodes, null)).toBe(nodes)

    const selected = applyMindmapSelection(nodes, 'root')
    expect(selected).not.toBe(nodes)
    expect(applyMindmapSelection(selected, 'root')).toBe(selected)
  })

  it('folds a branch in one pass and exposes its hidden descendant count', () => {
    const nodes = [node('root', 1, 0, 0), node('a', 2, 220, 0), node('leaf', 3, 440, 0)]
    const edges = [edge('root', 'a'), edge('a', 'leaf')]
    const model = buildMindmapModel(nodes, edges)
    const visibility = getMindmapVisibility(model, new Set(['root']))

    expect(visibility.visibleNodes.map((item) => item.id)).toEqual(['root'])
    expect(visibility.visibleEdges).toEqual([])
    expect(visibility.hiddenCountById.get('root')).toBe(2)
  })

  it('rejects cyclic drops and distinguishes child from sibling reorder zones', () => {
    const nodes = [
      node('root', 1, 0, 100),
      node('a', 2, 240, 20),
      node('leaf', 3, 480, 20),
      node('b', 4, 240, 180),
    ]
    const edges = [edge('root', 'a'), edge('a', 'leaf'), edge('root', 'b')]
    const model = buildMindmapModel(nodes, edges)

    expect(resolveMindmapDropIntent(model, 'root', { x: 500, y: 40 })).toBeNull()
    expect(resolveMindmapDropIntent(model, 'b', { x: 260, y: 30 })).toEqual({
      placement: 'child',
      targetId: 'a',
    })
    expect(resolveMindmapDropIntent(model, 'b', { x: 300, y: 100 })).toEqual({
      placement: 'after',
      targetId: 'a',
    })
  })

  it('indexes 1,000 topics within an interactive-frame budget', () => {
    const nodes = Array.from({ length: 1000 }, (_, index) =>
      node(`n${index}`, index + 1, (index % 10) * 220, Math.floor(index / 10) * 72),
    )
    const edges = Array.from({ length: 999 }, (_, index) => edge(`n${index}`, `n${index + 1}`))
    const started = performance.now()
    const model = buildMindmapModel(nodes, edges)
    const visibility = getMindmapVisibility(model, new Set(['n500']))
    const elapsed = performance.now() - started

    expect(model.nodesById.size).toBe(1000)
    expect(visibility.hiddenCountById.get('n500')).toBe(499)
    expect(elapsed).toBeLessThan(80)
  })
})
