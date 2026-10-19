import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Edge } from '@xyflow/react'
import { ConnectionMode, Position } from '@xyflow/system'
import { createWorkspaceMapCanvasEdgePainter } from '@/pages/workspace-map/workspaceMapCanvasEdgePainter'
import { createWorkspaceMapCanvasEdgeStyles } from '@/pages/workspace-map/workspaceMapCanvasEdgeStyles'
import type {
  GeometryState,
  WorkspaceMapOverviewEdge,
} from '@/pages/workspace-map/workspaceMapOverviewEdgeGeometry'

const geometry = vi.hoisted(() => ({ current: [] as WorkspaceMapOverviewEdge[] }))
vi.mock('@/pages/workspace-map/workspaceMapOverviewEdgeGeometry', () => ({
  createWorkspaceMapOverviewEdgeSelector: () => () => geometry.current,
}))

const edge: Edge = { id: 'a-b', source: 'a', target: 'b' }
const item: WorkspaceMapOverviewEdge = {
  edge,
  path: 'M0,0 C10,0 20,0 30,0',
  position: {
    sourceX: 0,
    sourceY: 0,
    targetX: 30,
    targetY: 0,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  },
}
const makeSemantics = (edges: Edge[]) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  for (const relation of edges) {
    const path = document.createElementNS(svg.namespaceURI, 'path')
    path.setAttribute('data-edge-id', relation.id)
    svg.append(path)
  }
  return svg
}

describe('workspace map canvas edge painting', () => {
  let frames: Map<number, FrameRequestCallback>
  let nextFrame: number
  const flush = () => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback(0))
  }
  beforeEach(() => {
    frames = new Map()
    nextFrame = 0
    geometry.current = [item]
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    vi.stubGlobal('Path2D', vi.fn(class {}))
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(
      () =>
        ({
          stroke: 'rgb(20, 40, 80)',
          strokeWidth: '0.9px',
          opacity: '0.08',
          strokeOpacity: '1',
          strokeDasharray: 'none',
          strokeDashoffset: '0px',
          strokeLinecap: 'round',
        }) as CSSStyleDeclaration,
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('coalesces movement, reuses native paths, applies camera/DPR, and releases the backing store', () => {
    const second = { ...edge, id: 'second' }
    geometry.current = [item, { ...item, edge: second }]
    const canvas = document.createElement('canvas')
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      setLineDash: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const state: GeometryState = {
      width: 800,
      height: 519,
      transform: [20, 30, 0.5],
      connectionMode: ConnectionMode.Strict,
      nodeLookup: new Map(),
    }
    const onVisible = vi.fn()
    const painter = createWorkspaceMapCanvasEdgePainter({
      canvas,
      context,
      semantics: makeSemantics([edge, second]),
      edges: [edge, second],
      getState: () => state,
      onVisible,
    })
    painter.schedule()
    painter.schedule()
    expect(frames.size).toBe(1)
    flush()
    expect([canvas.width, canvas.height]).toEqual([1600, 1038])
    expect(context.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 40, 60)
    expect(canvas.style.transform).toBe('matrix(2,0,0,2,-40,-60)')
    expect(canvas.style.width).toBe('800px')
    expect(canvas.style.height).toBe('519px')
    expect(context.globalAlpha).toBe(0.08)
    expect(context.lineCap).toBe('round')
    expect(context.stroke).toHaveBeenCalledTimes(2)
    expect(onVisible).toHaveBeenCalledWith([edge, second])
    const styleReads = vi.mocked(getComputedStyle).mock.calls.length
    state.transform = [-40, 0, 1]
    painter.schedule()
    flush()
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, -80, 0)
    expect(Path2D).toHaveBeenCalledTimes(2)
    expect(getComputedStyle).toHaveBeenCalledTimes(styleReads)
    expect(onVisible).toHaveBeenCalledTimes(1)
    geometry.current = [
      { ...item, path: 'M0,0 L80,80' },
      { ...item, edge: { ...edge, id: 'c' } },
    ]
    painter.schedule()
    flush()
    expect(Path2D).toHaveBeenCalledTimes(4)
    painter.schedule()
    painter.dispose()
    expect(frames.size).toBe(0)
    expect([canvas.width, canvas.height]).toEqual([0, 0])
    painter.schedule()
    expect(frames.size).toBe(0)
  })

  it('samples matching native transitions together while preserving their computed opacity', () => {
    const edges = [edge, { ...edge, id: 'c' }]
    const semantics = makeSemantics(edges)
    let running = true
    for (const path of semantics.querySelectorAll('path')) {
      path.getAnimations = () => [{ playState: running ? 'running' : 'finished' }] as Animation[]
    }
    const styles = createWorkspaceMapCanvasEdgeStyles()
    styles.refresh(semantics, edges)
    expect(styles.get('a-b')).toEqual(styles.get('c'))
    vi.mocked(getComputedStyle).mockClear()
    expect(styles.update()).toBe(true)
    expect(getComputedStyle).toHaveBeenCalledTimes(1)
    running = false
    vi.mocked(getComputedStyle).mockReturnValue({
      stroke: 'rgb(60, 80, 100)',
      strokeWidth: '0.75px',
      opacity: '0.28',
      strokeOpacity: '0.8',
      strokeDasharray: '5, 5',
      strokeDashoffset: '2px',
      strokeLinecap: 'butt',
    } as CSSStyleDeclaration)
    expect(styles.update()).toBe(false)
    expect(styles.get('c')).toEqual({
      stroke: 'rgb(60, 80, 100)',
      width: 0.75,
      opacity: 0.28 * 0.8,
      dash: [5, 5],
      offset: 2,
      cap: 'butt',
    })
    styles.refresh(semantics, [])
    expect(styles.get('c')).toBeUndefined()
  })
})
