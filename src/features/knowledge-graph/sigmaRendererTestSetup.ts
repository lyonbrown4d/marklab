import { beforeEach, afterEach, vi } from 'vitest'
import { createSigmaRenderer } from '@/features/knowledge-graph/sigmaRenderer'
import { graphViewCache } from '@/features/knowledge-graph/graphViewCache'
import { testGraph } from '@/features/knowledge-graph/testGraph'
import type { GraphCameraState } from '@/features/knowledge-graph/types'
import type { KnowledgeTopology } from '@/features/knowledge-graph/graphologyAdapter'

const mocks = vi.hoisted(() => ({
  kill: vi.fn(),
  refresh: vi.fn(),
  resize: vi.fn(),
  scheduleRender: vi.fn(),
  resizeCallback: () => {},
  events: new Map<string, (...args: never[]) => void>(),
  cameraEvents: new Map<string, (camera: GraphCameraState) => void>(),
  wheelEvents: new Map<string, (...args: never[]) => void>(),
  graph: null as KnowledgeTopology | null,
  workers: [] as {
    graph: KnowledgeTopology
    start: ReturnType<typeof vi.fn>
    kill: ReturnType<typeof vi.fn>
  }[],
  camera: { x: 0.5, y: 0.5, ratio: 1, angle: 0 },
  options: null as {
    primitives: { nodes: { layers: { drawingMode: string }[] } }
    settings: { enableNodeDrag: boolean; itemSizesReference: string }
    nodeReducer: (id: string, data: { size: number }) => { opacity: number }
    edgeReducer: (id: string) => { opacity: number }
  } | null,
}))
export { mocks }
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
    scheduleRender = mocks.scheduleRender
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
    start = vi.fn()
    kill = vi.fn()
    graph: KnowledgeTopology
    constructor(graph: KnowledgeTopology) {
      this.graph = graph
      mocks.workers.push(this)
    }
  },
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.events.clear()
  mocks.cameraEvents.clear()
  mocks.wheelEvents.clear()
  mocks.workers.length = 0
  mocks.camera = { x: 0.5, y: 0.5, ratio: 1, angle: 0 }
  graphViewCache.setState({ entries: [] })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        mocks.resizeCallback = callback
      }
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
export const setup = (
  graph = testGraph(),
  viewKey = 'workspace',
  container = document.createElement('div'),
) => {
  const onSelectNode = vi.fn(),
    onOpenNode = vi.fn(),
    onCameraChange = vi.fn()
  const renderer = createSigmaRenderer({
    graph,
    viewKey,
    workspaceKey: 'workspace',
    container,
    onSelectNode,
    onOpenNode,
    onCameraChange,
  })
  return { renderer, onSelectNode, onOpenNode, onCameraChange }
}
