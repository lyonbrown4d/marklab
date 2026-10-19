import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Edge, InternalNode, ReactFlowState } from '@xyflow/react'
import { ConnectionMode, Position } from '@xyflow/system'
import {
  createWorkspaceMapOverviewEdgeSelector,
  hideWorkspaceMapOverviewEdges,
  sameWorkspaceMapOverviewEdges,
} from '@/pages/workspace-map/workspaceMapOverviewEdgeGeometry'
import { WorkspaceMapOverviewEdges } from '@/pages/workspace-map/WorkspaceMapOverviewEdges'

type GeometryState = Pick<
  ReactFlowState,
  'nodeLookup' | 'width' | 'height' | 'transform' | 'connectionMode'
>
const store = vi.hoisted(() => ({ current: null as GeometryState | null }))
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  const api = { getState: () => store.current, subscribe: () => () => {} }
  return {
    ...actual,
    ViewportPortal: ({ children }: { children: React.ReactNode }) => children,
    useStoreApi: () => api,
    useStore: (selector: (state: GeometryState) => unknown) => {
      if (!store.current) throw new Error('Missing test geometry')
      return selector(store.current)
    },
  }
})

const node = (id: string, x: number): InternalNode => ({
  id,
  data: {},
  position: { x, y: 30 },
  measured: { width: 100, height: 60 },
  internals: {
    positionAbsolute: { x, y: 30 },
    z: 0,
    userNode: { id, data: {}, position: { x, y: 30 } },
    handleBounds: {
      source: [
        {
          id: null,
          nodeId: id,
          type: 'source',
          position: Position.Right,
          x: 96,
          y: 26,
          width: 8,
          height: 8,
        },
      ],
      target: [
        {
          id: null,
          nodeId: id,
          type: 'target',
          position: Position.Left,
          x: -4,
          y: 26,
          width: 8,
          height: 8,
        },
      ],
    },
  },
})
const state = (): GeometryState => ({
  width: 800,
  height: 600,
  transform: [0, 0, 1],
  connectionMode: ConnectionMode.Strict,
  nodeLookup: new Map([
    ['a', node('a', 20)],
    ['b', node('b', 300)],
  ]),
})
const edge: Edge = {
  id: 'a-b',
  source: 'a',
  target: 'b',
  className: 'graph-edge--reference workspace-map-flow-edge--connected',
  style: { strokeOpacity: 0.8 },
}

describe('workspace map overview edge layer', () => {
  let frames: FrameRequestCallback[]
  beforeEach(() => {
    store.current = state()
    frames = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('Path2D', class {})
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      setLineDash: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('uses measured handle endpoints and refreshes after handle-only map mutations', () => {
    const geometry = state()
    const select = createWorkspaceMapOverviewEdgeSelector([edge])
    const first = select(geometry)
    expect(first[0]?.position).toEqual({
      sourceX: 124,
      sourceY: 60,
      targetX: 296,
      targetY: 60,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    })
    const source = geometry.nodeLookup.get('a')!
    source.internals.handleBounds!.source![0]!.y = 40
    const changed = select(geometry)
    expect(changed[0]?.position.sourceY).toBe(74)
    expect(changed[0]?.path).not.toBe(first[0]?.path)
  })

  it('retains paths across viewport moves with unchanged visibility and updates membership', () => {
    const geometry = state()
    const select = createWorkspaceMapOverviewEdgeSelector([edge])
    const first = select(geometry)
    geometry.transform = [10, 0, 1]
    const panned = select(geometry)
    expect(sameWorkspaceMapOverviewEdges(first, panned)).toBe(true)
    expect(panned[0]).toBe(first[0])
    geometry.transform = [-2_000, 0, 1]
    expect(select(geometry)).toEqual([])
    expect(sameWorkspaceMapOverviewEdges(first, [])).toBe(false)
    geometry.transform = [0, 0, 1]
    expect(select(geometry)).toHaveLength(1)
  })

  it('omits hidden, missing, unmeasured, and invalid-handle relations', () => {
    const geometry = state()
    const edges = [
      { ...edge, hidden: true },
      { ...edge, id: 'missing', target: 'missing' },
      { ...edge, id: 'handle', sourceHandle: 'missing' },
    ]
    expect(createWorkspaceMapOverviewEdgeSelector(edges)(geometry)).toEqual([])
    geometry.nodeLookup.get('b')!.internals.handleBounds = undefined
    expect(createWorkspaceMapOverviewEdgeSelector([edge])(geometry)).toEqual([])
    geometry.height = 0
    expect(createWorkspaceMapOverviewEdgeSelector([edge])(geometry)).toEqual([])
  })

  it('paints on a bounded canvas while retaining non-painting accessible relations and styles', () => {
    const { container } = render(
      <WorkspaceMapOverviewEdges edges={[edge, { ...edge, id: 'hidden', hidden: true }]} />,
    )
    act(() => frames.shift()?.(0))
    act(() => frames.shift()?.(16))
    expect(container.querySelector('canvas')).toHaveAttribute('width', '800')
    expect(container.querySelector('canvas')).toHaveAttribute('height', '600')
    expect(container.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    expect(container.querySelectorAll('path')).toHaveLength(1)
    const group = container.querySelector('g')!
    expect(group).toHaveClass(
      'graph-edge--reference',
      'workspace-map-flow-edge--connected',
      '!pointer-events-none',
    )
    expect(group).toHaveAttribute('aria-label', 'Edge from a to b')
    expect(group).toHaveAttribute('role', 'img')
    expect(container.querySelector('path')).not.toHaveAttribute('d')
    expect(container.querySelector('path')).toHaveStyle({ strokeOpacity: '0.8' })
    expect(container.querySelector('.react-flow__edge-interaction')).toBeNull()
  })

  it('retains SVG rendering when a 2D context is unavailable', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    const { container } = render(<WorkspaceMapOverviewEdges edges={[edge]} />)
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('path')?.getAttribute('d')).toContain('M124,60')
    expect(container.querySelector('g')).toHaveAttribute('aria-label', 'Edge from a to b')
  })

  it('hides only the React Flow presentation while retaining canonical relation identities', () => {
    const hidden: Edge = { ...edge, id: 'already-hidden', hidden: true }
    const canonical = [edge, hidden]
    const flow = hideWorkspaceMapOverviewEdges(canonical)
    expect(flow.map(({ id, source, target, hidden }) => ({ id, source, target, hidden }))).toEqual([
      { id: 'a-b', source: 'a', target: 'b', hidden: true },
      { id: 'already-hidden', source: 'a', target: 'b', hidden: true },
    ])
    expect(flow[1]).toBe(hidden)
    expect(edge.hidden).toBeUndefined()
    expect(createWorkspaceMapOverviewEdgeSelector(canonical)(state())).toHaveLength(1)
  })
})
