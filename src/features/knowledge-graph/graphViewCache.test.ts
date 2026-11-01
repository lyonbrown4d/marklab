import { beforeEach, describe, expect, it } from 'vitest'
import {
  graphViewCache,
  readGraphView,
  saveGraphView,
} from '@/features/knowledge-graph/graphViewCache'

const camera = { x: 0.5, y: 0.5, ratio: 1, angle: 0 }
beforeEach(() => graphViewCache.setState({ entries: [] }))

describe('bounded manual graph view persistence', () => {
  it('keeps only the latest explicit overrides per view, including camera-only views', () => {
    saveGraphView('workspace', 'old', { a: { x: 1, y: 2 } }, camera)
    saveGraphView('workspace', 'new', { a: { x: 3, y: 4 } }, { ...camera, ratio: 0.7 })
    expect(readGraphView('workspace')?.manualOverrides.a).toEqual({ x: 3, y: 4 })
    expect(readGraphView('workspace')?.topologyKey).toBe('new')
    expect(graphViewCache.getState().entries).toHaveLength(1)
    expect(readGraphView('other')).toBeUndefined()
    saveGraphView('workspace', 'new', {}, { ...camera, ratio: 0.4 }, 'document:a.md')
    expect(readGraphView('workspace')?.camera.ratio).toBe(0.7)
    expect(readGraphView('workspace', 'document:a.md')).toMatchObject({
      manualOverrides: {},
      camera: { ratio: 0.4 },
    })
    saveGraphView('workspace', 'new', {}, camera)
    expect(readGraphView('workspace')?.manualOverrides).toEqual({})
    expect(readGraphView('workspace')?.camera).toEqual(camera)
  })
  it('bounds views and total manual positions without dropping cameras, and rejects nonfinite values', () => {
    for (let index = 0; index < 10; index += 1)
      saveGraphView(`workspace${index}`, 'topology', {}, camera)
    expect(graphViewCache.getState().entries).toHaveLength(8)
    const positions = Object.fromEntries(
      Array.from({ length: 7000 }, (_, index) => [`n${index}`, { x: index, y: 0 }]),
    )
    saveGraphView('large', 'one', positions, camera)
    saveGraphView('large2', 'two', positions, camera)
    expect(
      graphViewCache
        .getState()
        .entries.reduce((sum, entry) => sum + Object.keys(entry.manualOverrides).length, 0),
    ).toBe(12_000)
    expect(readGraphView('workspace9')?.camera).toEqual(camera)
    saveGraphView('invalid', 'nan', { a: { x: NaN, y: 1 } }, camera)
    saveGraphView('invalid', 'infinite', { a: { x: Infinity, y: 1 } }, camera)
    saveGraphView('invalid', 'ratio', {}, { ...camera, ratio: -1 })
    expect(readGraphView('invalid')).toBeUndefined()
  })
  it('discards older renderer-computed layouts instead of treating them as manual drags', async () => {
    localStorage.setItem(
      'marklab.knowledgeGraph.views',
      JSON.stringify({
        version: 2,
        state: {
          entries: [
            {
              workspaceKey: 'legacy',
              viewKey: 'workspace',
              topologyKey: 'old',
              positions: { a: { x: 10, y: 20 } },
              camera,
            },
          ],
        },
      }),
    )
    await graphViewCache.persist.rehydrate()
    expect(graphViewCache.getState().entries).toEqual([])
    saveGraphView('workspace', 'new', {}, camera)
    graphViewCache.setState({ entries: [] })
    // Rehydrate the last saved payload, including a view with no dragged nodes.
    const saved = {
      version: 3,
      state: {
        entries: [
          {
            workspaceKey: 'workspace',
            viewKey: 'workspace',
            topologyKey: 'new',
            manualOverrides: {},
            camera,
          },
        ],
      },
    }
    localStorage.setItem('marklab.knowledgeGraph.views', JSON.stringify(saved))
    await graphViewCache.persist.rehydrate()
    expect(readGraphView('workspace')).toMatchObject({ manualOverrides: {}, camera })
  })
})
