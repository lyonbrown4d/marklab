import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createSigmaRenderer } from '@/features/knowledge-graph/sigmaRenderer'
import { graphViewCache } from '@/features/knowledge-graph/graphViewCache'
import { testGraph } from '@/features/knowledge-graph/testGraph'
import type { GraphCameraState } from '@/features/knowledge-graph/types'
import type { KnowledgeTopology } from '@/features/knowledge-graph/graphologyAdapter'

const mocks = vi.hoisted(() => ({
  kill: vi.fn(),
  refresh: vi.fn(),
  resize: vi.fn(),
  events: new Map<string, (...args: never[]) => void>(),
  cameraEvents: new Map<string, (camera: GraphCameraState) => void>(),
  wheelEvents: new Map<string, (...args: never[]) => void>(),
  graph: null as KnowledgeTopology | null,
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
          const changed = Object.entries(next).some(
            ([key, value]) => mocks.camera[key as keyof GraphCameraState] !== value,
          )
          mocks.camera = { ...mocks.camera, ...next }
          if (changed) mocks.cameraEvents.get('updated')?.(mocks.camera)
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
    graphToViewport() {
      return { x: 120, y: 120 }
    }
    getDimensions() {
      return { width: 640, height: 480 }
    }
    scaleSize(size: number) {
      return size / Math.sqrt(mocks.camera.ratio)
    }
    off(name: string) {
      mocks.events.delete(name)
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 32 }),
  } as CanvasRenderingContext2D)
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
  it('uses native coordinates immediately, never saves the native base, and releases resources', () => {
    const { renderer } = setup()
    expect(mocks.options?.settings.enableNodeDrag).toBe(true)
    expect(mocks.options?.settings.itemSizesReference).toBe('screen')
    expect(mocks.options?.primitives.nodes.layers[0].drawingMode).toBe('color')
    expect(mocks.graph?.getNodeAttributes('file:b.md')).toMatchObject(testGraph().nodes[1].position)
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'iconKind')).toBe('markdown')
    mocks.refresh.mockClear()
    vi.advanceTimersByTime(3000)
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.graph?.getNodeAttributes('file:b.md')).toMatchObject(testGraph().nodes[1].position)
    renderer.zoom(0.5)
    renderer.destroy()
    renderer.destroy()
    expect(mocks.kill).toHaveBeenCalledOnce()
    expect(mocks.wheelEvents.size).toBe(0)
    expect(graphViewCache.getState().entries[0]).toMatchObject({
      topologyKey: 'topology-1',
      manualOverrides: {},
      camera: mocks.camera,
    })
    expect(graphViewCache.getState().entries[0].camera.ratio).toBe(0.5)
  })
  it('persists an explicit fit even when the camera is already at its default position', () => {
    const { renderer, onCameraChange } = setup()
    expect(graphViewCache.getState().entries).toEqual([])
    renderer.fit()
    expect(onCameraChange).not.toHaveBeenCalled()
    expect(graphViewCache.getState().entries[0]).toMatchObject({
      manualOverrides: {},
      camera: mocks.camera,
    })
    renderer.destroy()
  })
  it('persists only explicit drags and applies them over a changed native base without moving the camera', () => {
    const { renderer } = setup()
    renderer.focus({ nodeId: 'file:a.md', viewport: { x: 0.3, y: 0.4, ratio: 0.6, angle: 0 } })
    mocks.graph?.setNodeAttribute('file:a.md', 'x', 42)
    mocks.graph?.setNodeAttribute('file:b.md', 'x', 999)
    mocks.events.get('nodeDragEnd')?.({
      node: 'file:a.md',
      allDraggedNodes: ['file:a.md'],
    } as never)
    expect(graphViewCache.getState().entries[0].manualOverrides).toEqual({
      'file:a.md': { x: 42, y: 0 },
    })
    const updated = testGraph()
    updated.nodes[0].position = { x: -50, y: 60 }
    updated.nodes[1].position = { x: 300, y: 90 }
    updated.nodes[0].label = 'Renamed'
    updated.nodes[0].path = 'assets/renamed.png'
    renderer.updateContent(updated)
    expect(mocks.graph?.getNodeAttributes('file:a.md')).toMatchObject({
      x: 42,
      y: 0,
      label: 'Renamed',
      iconKind: 'image',
    })
    expect(mocks.graph?.getNodeAttributes('file:b.md')).toMatchObject({ x: 300, y: 90 })
    expect(mocks.camera).toMatchObject({ x: 0.3, y: 0.4, ratio: 0.6 })
    renderer.arrange()
    expect(mocks.graph?.getNodeAttributes('file:a.md')).toMatchObject({ x: -50, y: 60 })
    expect(graphViewCache.getState().entries[0].manualOverrides).toEqual({})
    expect(mocks.camera).toMatchObject({ x: 0.3, y: 0.4, ratio: 0.6 })
    renderer.destroy()
    const restored = setup(updated)
    expect(mocks.graph?.getNodeAttributes('file:a.md')).toMatchObject({ x: -50, y: 60 })
    expect(mocks.camera.ratio).toBe(0.6)
    restored.renderer.destroy()
  })
  it('retains manual positions across topology changes, prunes removed nodes, and isolates workspace and document views', () => {
    const initial = setup()
    initial.renderer.focus({
      nodeId: 'file:a.md',
      viewport: { x: 0.3, y: 0.4, ratio: 0.6, angle: 0 },
    })
    mocks.graph?.setNodeAttribute('file:a.md', 'x', 42)
    mocks.events.get('nodeDragEnd')?.({
      node: 'file:a.md',
      allDraggedNodes: ['file:a.md'],
    } as never)
    initial.renderer.destroy()
    const changed = setup({ ...testGraph(), topology_key: 'topology-2' })
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'x')).toBe(42)
    expect(mocks.camera).toMatchObject({ x: 0.3, y: 0.4, ratio: 0.6 })
    changed.renderer.destroy()
    const local = setup(testGraph(), 'document:a.md')
    expect(mocks.graph?.getNodeAttribute('file:a.md', 'x')).toBe(0)
    expect(mocks.camera).toMatchObject({ x: 0.5, y: 0.5, ratio: 1 })
    local.renderer.destroy()
    const removed = testGraph()
    removed.nodes = removed.nodes.slice(1)
    const remaining = setup(removed)
    remaining.renderer.destroy()
    expect(graphViewCache.getState().entries[0].manualOverrides).toEqual({})
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
    mocks.events.get('nodeDragEnd')?.({
      node: 'file:a.md',
      allDraggedNodes: ['file:a.md'],
    } as never)
    expect(graphViewCache.getState().entries[0].manualOverrides['file:a.md'].x).toBe(9)
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
})
