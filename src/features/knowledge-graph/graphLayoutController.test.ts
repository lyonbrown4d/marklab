import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGraphLayout } from '@/features/knowledge-graph/graphLayoutController'
import {
  createKnowledgeTopology,
  readGraphPalette,
  topologyPositions,
  type KnowledgeTopology,
} from '@/features/knowledge-graph/graphologyAdapter'
import { testGraph } from '@/features/knowledge-graph/testGraph'
import type { ForceAtlas2Settings } from 'graphology-layout-forceatlas2'

const state = vi.hoisted(() => ({
  fail: false,
  workers: [] as {
    graph: KnowledgeTopology
    options: { settings: ForceAtlas2Settings }
    start: ReturnType<typeof vi.fn>
    kill: ReturnType<typeof vi.fn>
  }[],
}))
vi.mock('graphology-layout-forceatlas2/worker', () => ({
  default: class {
    start = vi.fn()
    kill = vi.fn()
    graph: KnowledgeTopology
    options: { settings: ForceAtlas2Settings }
    constructor(graph: KnowledgeTopology, options: { settings: ForceAtlas2Settings }) {
      this.graph = graph
      this.options = options
      if (state.fail) throw new Error('Worker blocked')
      state.workers.push(this)
    }
  },
}))
beforeEach(() => {
  vi.useFakeTimers()
  state.workers.length = 0
  state.fail = false
})
afterEach(() => vi.useRealTimers())
const topology = (positions = {}) =>
  createKnowledgeTopology(testGraph(), positions, readGraphPalette(document.createElement('div')))

describe('finite Graphology worker lifecycle', () => {
  it('applies circular and directory-grouped library layouts without starting a force worker', () => {
    const graph = topology()
    const settled = vi.fn()
    const layout = createGraphLayout(graph, settled)
    layout.start({}, 'circular')
    const circular = topologyPositions(graph)
    expect(new Set(Object.values(circular).map(({ x, y }) => `${x}:${y}`)).size).toBe(3)
    const manual = { 'file:a.md': { x: 42, y: 12 } }
    graph.setNodeAttribute('missing:c.md', 'layoutGroup', 'directory:another')
    layout.start(manual, 'grouped')
    expect(topologyPositions(graph)['file:a.md']).toEqual(manual['file:a.md'])
    expect(topologyPositions(graph)['file:b.md']).not.toEqual(circular['file:b.md'])
    expect(Object.keys(topologyPositions(graph))).toHaveLength(3)
    expect(settled).toHaveBeenCalledTimes(2)
    expect(state.workers).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    layout.destroy()
  })
  it('computes privately, fixes explicit drags, and publishes finite results once within its deadline', () => {
    const manual = { 'file:a.md': { x: 42, y: 12 } }
    const graph = topology(manual)
    const seeded = topologyPositions(graph)
    const settled = vi.fn()
    const layout = createGraphLayout(graph, settled)
    layout.start(manual)
    const worker = state.workers[0]
    expect(worker.start).toHaveBeenCalledOnce()
    expect(worker.options.settings.barnesHutOptimize).toBe(false)
    expect(worker.graph.getNodeAttribute('file:a.md', 'fixed')).toBe(true)
    expect(worker.graph.getNodeAttribute('file:b.md', 'fixed')).toBe(false)
    worker.graph.mergeNodeAttributes('file:a.md', { x: 999, y: 999 })
    worker.graph.mergeNodeAttributes('file:b.md', { x: 80, y: 90 })
    worker.graph.setNodeAttribute('missing:c.md', 'x', NaN)
    expect(topologyPositions(graph)).toEqual(seeded)
    vi.advanceTimersByTime(2500)
    expect(worker.kill).toHaveBeenCalledOnce()
    expect(settled).toHaveBeenCalledOnce()
    expect(graph.getNodeAttributes('file:a.md')).toMatchObject(manual['file:a.md'])
    expect(graph.getNodeAttributes('file:b.md')).toMatchObject({ x: 80, y: 90 })
    expect(graph.getNodeAttributes('missing:c.md')).toMatchObject(seeded['missing:c.md'])
    vi.advanceTimersByTime(5000)
    expect(settled).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    layout.destroy()
  })
  it('kills superseded, dragged and disposed computations without publishing late updates', () => {
    const graph = topology()
    const settled = vi.fn()
    const layout = createGraphLayout(graph, settled)
    layout.start({})
    const old = state.workers[0]
    layout.start({})
    const current = state.workers[1]
    expect(old.kill).toHaveBeenCalledOnce()
    layout.stop()
    expect(current.kill).toHaveBeenCalledOnce()
    graph.setNodeAttribute('file:a.md', 'x', 42)
    old.graph.setNodeAttribute('file:a.md', 'x', 999)
    current.graph.setNodeAttribute('file:a.md', 'x', 888)
    vi.advanceTimersByTime(2500)
    expect(graph.getNodeAttribute('file:a.md', 'x')).toBe(42)
    expect(settled).not.toHaveBeenCalled()
    layout.start({})
    layout.destroy()
    state.workers[2].graph.setNodeAttribute('file:a.md', 'x', 777)
    vi.advanceTimersByTime(2500)
    layout.start({})
    expect(state.workers).toHaveLength(3)
    expect(graph.getNodeAttribute('file:a.md', 'x')).toBe(42)
    expect(settled).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('uses Barnes-Hut for larger topologies and still terminates within 2.5 seconds', () => {
    const data = testGraph()
    const file = data.nodes[0]
    data.nodes = Array.from({ length: 1200 }, (_, index) => ({ ...file, id: `node:${index}` }))
    data.edges = []
    const graph = createKnowledgeTopology(data, {}, readGraphPalette(document.createElement('div')))
    const settled = vi.fn()
    const layout = createGraphLayout(graph, settled)
    layout.start({})
    expect(state.workers[0].options.settings.barnesHutOptimize).toBe(true)
    vi.advanceTimersByTime(2499)
    expect(settled).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(settled).toHaveBeenCalledOnce()
    expect(state.workers[0].kill).toHaveBeenCalledOnce()
    layout.destroy()
  })
  it('keeps library seeds usable when workers are unavailable and does not create one for a single node', () => {
    const graph = topology()
    const seeded = topologyPositions(graph)
    const settled = vi.fn()
    const layout = createGraphLayout(graph, settled)
    state.fail = true
    layout.start({})
    expect(topologyPositions(graph)).toEqual(seeded)
    expect(settled).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    layout.destroy()
    graph.dropNode('file:b.md')
    graph.dropNode('missing:c.md')
    state.fail = false
    const single = createGraphLayout(graph, settled)
    single.start({})
    expect(state.workers).toHaveLength(0)
    expect(settled).toHaveBeenCalledTimes(2)
    single.start({}, 'grouped')
    expect(Object.keys(topologyPositions(graph))).toHaveLength(1)
    graph.clear()
    single.start({}, 'grouped')
    expect(state.workers).toHaveLength(0)
    single.destroy()
  })
})
