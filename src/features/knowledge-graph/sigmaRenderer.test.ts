import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createSigmaRenderer } from '@/features/knowledge-graph/sigmaRenderer'
import { graphViewCache } from '@/features/knowledge-graph/graphViewCache'
import { testGraph } from '@/features/knowledge-graph/testGraph'
import type { GraphCameraState } from '@/features/knowledge-graph/types'
import type { KnowledgeTopology } from '@/features/knowledge-graph/graphologyAdapter'

const mocks = vi.hoisted(() => ({
  kill: vi.fn(),
  workerKill: vi.fn(),
  start: vi.fn(),
  refresh: vi.fn(),
  resize: vi.fn(),
  events: new Map<string, (...args: never[]) => void>(),
  cameraEvents: new Map<string, (camera: GraphCameraState) => void>(),
  wheelEvents: new Map<string, (...args: never[]) => void>(),
  graph: null as KnowledgeTopology | null,
  layoutGraph: null as KnowledgeTopology | null,
  camera: { x: 0.5, y: 0.5, ratio: 1, angle: 0 },
  options: null as {
    primitives: { nodes: { layers: { drawingMode: string }[] } }
    settings: { enableNodeDrag: boolean; itemSizesReference: string }
    nodeReducer: (id: string, data: { size: number }) => { opacity: number }
    edgeReducer: (id: string) => { opacity: number }
  } | null,
}))
vi.mock('sigma', () => ({
  DEFAULT_STYLES: { nodes: {}, edges: {} },
  default: class {
    constructor(graph: KnowledgeTopology, _container: HTMLElement, options: typeof mocks.options) {
      mocks.graph = graph
      mocks.camera = { x: 0.5, y: 0.5, ratio: 1, angle: 0 }
      mocks.options = options
    }
    on(name: string, callback: (...args: never[]) => void) {
      mocks.events.set(name, callback)
    }
    getCamera() {
      return {
        getState: () => mocks.camera,
        getBoundedRatio: (ratio: number) => Math.min(8, Math.max(0.05, ratio)),
        setState: (next: Partial<GraphCameraState>) => {
          mocks.camera = { ...mocks.camera, ...next }
          mocks.cameraEvents.get('updated')?.(mocks.camera)
        },
        on: (name: string, callback: (camera: GraphCameraState) => void) =>
          mocks.cameraEvents.set(name, callback),
        off: vi.fn(),
        cancelAnimation: vi.fn(),
        get ratio() {
          return mocks.camera.ratio
        },
      }
    }
    getMouseCaptor() {
      return {
        on: (name: string, callback: (...args: never[]) => void) =>
          mocks.wheelEvents.set(name, callback),
        off: (name: string) => mocks.wheelEvents.delete(name),
      }
    }
    graphToFramedGraph() {
      return { x: 0.2, y: 0.3 }
    }
    refresh = mocks.refresh
    resize = mocks.resize
    kill = mocks.kill
  },
}))
vi.mock('sigma/primitives', () => ({ DEFAULT_EDGE_PRIMITIVES: {} }))
vi.mock('sigma/rendering', () => ({
  extremityArrow: () => ({ name: 'arrow' }),
  sdfSquare: () => ({ name: 'square' }),
}))
vi.mock('@sigma/node-image', () => ({ layerImage: (options: unknown) => options }))
vi.mock('graphology-layout-forceatlas2/worker', () => ({
  default: class {
    constructor(graph: KnowledgeTopology) {
      mocks.layoutGraph = graph
    }
    start = mocks.start
    kill = mocks.workerKill
  },
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.events.clear()
  mocks.cameraEvents.clear()
  mocks.wheelEvents.clear()
  mocks.camera = { x: 0.5, y: 0.5, ratio: 1, angle: 0 }
  graphViewCache.setState({ entries: [] })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const setup = (graph = testGraph(), viewKey = 'workspace') => {
  const onSelectNode = vi.fn(),
    onOpenNode = vi.fn(),
    onCameraChange = vi.fn()
  const renderer = createSigmaRenderer({
    graph,
    viewKey,
    workspaceKey: 'workspace',
    container: document.createElement('div'),
    onSelectNode,
    onOpenNode,
    onCameraChange,
  })
  return { renderer, onSelectNode, onOpenNode, onCameraChange }
}

describe('Sigma4 graph renderer integration', () => {
  it('runs a finite layout and releases renderer and worker resources on destruction', () => {
    const { renderer } = setup()
    expect(mocks.options?.settings.enableNodeDrag).toBe(true)
    expect(mocks.options?.settings.itemSizesReference).toBe('screen')
    expect(mocks.options?.primitives.nodes.layers[0].drawingMode).toBe('color')
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'iconKind')).toBe('markdown')
    expect(mocks.wheelEvents.has('wheel')).toBe(true)
    expect(mocks.start).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(3000)
    expect(mocks.workerKill).toHaveBeenCalledOnce()
    renderer.destroy()
    renderer.destroy()
    expect(mocks.kill).toHaveBeenCalledOnce()
    expect(mocks.wheelEvents.size).toBe(0)
    expect(graphViewCache.getState().entries[0].topologyKey).toBe('topology-1')
  })
  it('rearranges cached positions, cancels an earlier run and stops the replacement without moving the camera', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const initial = setup()
    initial.renderer.focus({
      nodeId: 'file:a.md',
      viewport: { x: 0.3, y: 0.4, ratio: 0.6, angle: 0 },
    })
    initial.renderer.destroy()
    mocks.start.mockClear()
    mocks.workerKill.mockClear()
    const restored = setup()
    expect(mocks.start).not.toHaveBeenCalled()
    restored.renderer.arrange()
    mocks.layoutGraph?.setNodeAttribute('file:a.md', 'x', 42)
    vi.advanceTimersByTime(400)
    restored.renderer.arrange()
    expect(mocks.workerKill).toHaveBeenCalledOnce()
    expect(mocks.start).toHaveBeenCalledTimes(2)
    mocks.layoutGraph?.setNodeAttribute('file:a.md', 'x', 84)
    vi.advanceTimersByTime(250)
    expect(mocks.workerKill).toHaveBeenCalledOnce()
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'x')).toBe(42)
    vi.advanceTimersByTime(1000)
    expect(mocks.workerKill).toHaveBeenCalledTimes(2)
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'x')).toBe(84)
    expect(mocks.camera).toMatchObject({ x: 0.3, y: 0.4, ratio: 0.6 })
    expect(graphViewCache.getState().entries[0].positions['file:a.md'].x).toBe(84)
    restored.renderer.destroy()
  })
  it('publishes layout only once when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { renderer } = setup()
    const initialX = mocks.graph?.getNodeAttribute('file:a.md', 'x')
    expect(mocks.layoutGraph).not.toBe(mocks.graph)
    mocks.layoutGraph?.setNodeAttribute('file:a.md', 'x', 42)
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'x')).toBe(initialX)
    expect(mocks.refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3000)
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'x')).toBe(42)
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.workerKill).toHaveBeenCalledOnce()
    renderer.destroy()
  })
  it('keeps positions and camera through content refresh and restores the same topology without relayout', () => {
    const { renderer } = setup()
    mocks.graph?.setNodeAttribute('file:a.md', 'x', 42)
    renderer.focus({ nodeId: 'file:a.md', viewport: { x: 0.3, y: 0.4, ratio: 0.6, angle: 0 } })
    const updated = testGraph()
    updated.nodes[0].label = 'Renamed'
    updated.nodes[0].path = 'assets/renamed.png'
    renderer.updateContent(updated)
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'label')).toBe('Renamed')
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'iconKind')).toBe('image')
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'x')).toBe(42)
    expect(mocks.camera.ratio).toBe(0.6)
    renderer.destroy()
    mocks.start.mockClear()
    const restored = setup()
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'x')).toBe(42)
    expect(mocks.camera).toMatchObject({ x: 0.3, y: 0.4, ratio: 0.6 })
    restored.renderer.destroy()
  })
  it('preserves camera after topology changes within a view while isolating document views', () => {
    const initial = setup()
    initial.renderer.focus({
      nodeId: 'file:a.md',
      viewport: { x: 0.3, y: 0.4, ratio: 0.6, angle: 0 },
    })
    initial.renderer.destroy()
    const changed = setup({ ...testGraph(), topology_key: 'topology-2' })
    expect(mocks.camera).toMatchObject({ x: 0.3, y: 0.4, ratio: 0.6 })
    changed.renderer.destroy()
    const local = setup(testGraph(), 'document:a.md')
    expect(mocks.camera).toMatchObject({ x: 0.5, y: 0.5, ratio: 1 })
    local.renderer.destroy()
  })
  it('selects without opening, opens on double click and dims unrelated nodes', () => {
    const { renderer, onSelectNode, onOpenNode } = setup()
    mocks.events.get('clickNode')?.({ node: 'file:b.md' } as never)
    expect(onSelectNode).toHaveBeenCalledWith('file:b.md')
    expect(onOpenNode).not.toHaveBeenCalled()
    mocks.events.get('clickStage')?.()
    expect(onSelectNode).toHaveBeenLastCalledWith(null)
    const preventSigmaDefault = vi.fn()
    mocks.events.get('doubleClickNode')?.({
      node: 'file:b.md',
      event: { preventSigmaDefault },
    } as never)
    expect(onOpenNode).toHaveBeenCalledWith('file:b.md')
    expect(preventSigmaDefault).toHaveBeenCalledOnce()
    renderer.select('file:b.md')
    expect(mocks.options?.nodeReducer('missing:c.md', { size: 3 }).opacity).toBe(0.2)
    expect(mocks.options?.nodeReducer('file:a.md', { size: 5 }).opacity).toBe(1)
    expect(mocks.options?.edgeReducer('a-c').opacity).toBe(0.1)
    renderer.select(null)
    expect(mocks.options?.nodeReducer('missing:c.md', { size: 3 }).opacity).toBe(1)
    expect(renderer.focus({ nodeId: 'absent' })).toBe(false)
    renderer.destroy()
  })
  it('retains focus, drag, camera controls and theme colors with icon nodes', async () => {
    const { renderer, onCameraChange } = setup()
    renderer.select('file:a.md')
    renderer.focus({ nodeId: 'a.md' })
    expect(mocks.camera).toMatchObject({ x: 0.2, y: 0.3, ratio: 0.35 })
    renderer.fit()
    renderer.zoom(0.5)
    expect(mocks.camera).toMatchObject({ x: 0.5, y: 0.5, ratio: 0.5 })
    expect(onCameraChange).toHaveBeenLastCalledWith(mocks.camera)
    vi.advanceTimersByTime(250)
    expect(graphViewCache.getState().entries[0].camera.ratio).toBe(0.5)
    renderer.arrange()
    mocks.events.get('nodeDragStart')?.()
    mocks.graph?.setNodeAttribute('file:a.md', 'x', 9)
    mocks.events.get('nodeDragEnd')?.()
    expect(graphViewCache.getState().entries[0].positions['file:a.md'].x).toBe(9)
    const previousPrimary = document.documentElement.style.getPropertyValue('--primary')
    document.documentElement.style.setProperty('--primary', '0 100% 50%')
    await Promise.resolve()
    expect(mocks.options?.nodeReducer('file:a.md', { size: 10 })).toMatchObject({
      color: 'rgb(255, 0, 0)',
    })
    renderer.focus({ nodeId: 'workspace' })
    expect(mocks.camera).toMatchObject({ x: 0.5, y: 0.5, ratio: 1 })
    renderer.destroy()
    document.documentElement.style.setProperty('--primary', previousPrimary)
    renderer.zoom(2)
    renderer.fit()
    renderer.select('file:a.md')
    renderer.updateContent(testGraph())
    expect(renderer.focus({ nodeId: 'workspace' })).toBe(false)
    expect(mocks.camera.ratio).toBe(1)
  })
  it('keeps seeded icon nodes usable when the layout worker fails', () => {
    mocks.start.mockImplementationOnce(() => {
      throw new Error('Worker unavailable')
    })
    const { renderer } = setup()
    expect(mocks.workerKill).toHaveBeenCalledOnce()
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'iconKind')).toBe('markdown')
    renderer.focus({ nodeId: 'workspace' })
    renderer.destroy()
  })
})
