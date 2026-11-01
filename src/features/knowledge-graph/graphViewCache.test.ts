import { beforeEach, describe, expect, it } from 'vitest'
import {
  graphViewCache,
  readGraphView,
  saveGraphView,
} from '@/features/knowledge-graph/graphViewCache'

const camera = { x: 0.5, y: 0.5, ratio: 1, angle: 0 }
beforeEach(() => graphViewCache.setState({ entries: [] }))

describe('bounded graph view persistence', () => {
  it('restores exact topology first and reuses workspace positions after topology changes', () => {
    saveGraphView('workspace', 'old', { a: { x: 1, y: 2 } }, camera)
    saveGraphView('workspace', 'new', { a: { x: 3, y: 4 } }, camera)
    expect(readGraphView('workspace', 'old')?.positions.a).toEqual({ x: 1, y: 2 })
    expect(readGraphView('workspace', 'unknown')?.positions.a).toEqual({ x: 3, y: 4 })
    expect(readGraphView('other', 'old')).toBeUndefined()
    saveGraphView(
      'workspace',
      'new',
      { a: { x: 5, y: 6 } },
      { ...camera, ratio: 0.4 },
      'document:a.md',
    )
    expect(readGraphView('workspace', 'new')?.camera.ratio).toBe(1)
    expect(readGraphView('workspace', 'new', 'document:a.md')?.camera.ratio).toBe(0.4)
    saveGraphView('workspace', 'new', { a: { x: 3, y: 4 } }, { ...camera, ratio: 0.7 })
    expect(readGraphView('workspace', 'old')?.camera.ratio).toBe(0.7)
  })
  it('bounds snapshots and total positions and ignores invalid camera/position values', () => {
    for (let index = 0; index < 10; index += 1)
      saveGraphView(`workspace${index}`, 'topology', { a: { x: index, y: 0 } }, camera)
    expect(graphViewCache.getState().entries).toHaveLength(8)
    const positions = Object.fromEntries(
      Array.from({ length: 7000 }, (_, index) => [`n${index}`, { x: index, y: 0 }]),
    )
    saveGraphView('large', 'one', positions, camera)
    saveGraphView('large', 'two', positions, camera)
    expect(
      graphViewCache
        .getState()
        .entries.reduce((sum, entry) => sum + Object.keys(entry.positions).length, 0),
    ).toBe(12_000)
    saveGraphView('invalid', 'nan', { a: { x: NaN, y: 1 } }, camera)
    saveGraphView('invalid', 'ratio', { a: { x: 1, y: 1 } }, { ...camera, ratio: -1 })
    expect(readGraphView('invalid', 'nan')).toBeUndefined()
  })
})
