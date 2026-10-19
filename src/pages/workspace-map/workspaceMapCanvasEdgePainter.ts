import type { Edge } from '@xyflow/react'
import {
  createWorkspaceMapOverviewEdgeSelector,
  type GeometryState,
  type WorkspaceMapOverviewEdge,
} from '@/pages/workspace-map/workspaceMapOverviewEdgeGeometry'
import { createWorkspaceMapCanvasEdgeStyles } from '@/pages/workspace-map/workspaceMapCanvasEdgeStyles'

type Options = {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  semantics: SVGSVGElement
  edges: Edge[]
  getState: () => GeometryState
  onVisible: (edges: Edge[]) => void
}

export const createWorkspaceMapCanvasEdgePainter = ({
  canvas,
  context,
  semantics,
  edges,
  getState,
  onVisible,
}: Options) => {
  const select = createWorkspaceMapOverviewEdgeSelector(edges)
  const styles = createWorkspaceMapCanvasEdgeStyles()
  let paths = new Map<string, { path: string; shape: Path2D }>()
  let visible: Edge[] = []
  let frame: number | undefined
  let dirty = true
  let forceStyles = true
  let animating = false
  let disposed = false

  const draw = () => {
    frame = undefined
    if (disposed) return
    const state = getState()
    const geometry = select(state)
    const nextVisible = geometry.map(({ edge }) => edge)
    if (
      nextVisible.length !== visible.length ||
      nextVisible.some((edge, index) => edge !== visible[index])
    ) {
      visible = nextVisible
      onVisible(visible)
      dirty = true
    }
    if (dirty) {
      styles.refresh(semantics, visible, forceStyles)
      dirty = false
      forceStyles = false
      animating = true
    }
    if (animating) animating = styles.update()
    const ratio = window.devicePixelRatio || 1
    const width = Math.max(0, Math.round(state.width * ratio))
    const height = Math.max(0, Math.round(state.height * ratio))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, width, height)
    const [x, y, zoom] = state.transform
    // Cancel the portal's camera transform: the bitmap stays viewport-sized.
    canvas.style.width = `${state.width}px`
    canvas.style.height = `${state.height}px`
    canvas.style.transform = `matrix(${1 / zoom},0,0,${1 / zoom},${-x / zoom},${-y / zoom})`
    context.setTransform(ratio * zoom, 0, 0, ratio * zoom, ratio * x, ratio * y)
    const nextPaths = new Map<string, { path: string; shape: Path2D }>()
    for (const item of geometry) paintEdge(item, nextPaths)
    paths = nextPaths
    if (animating) schedule()
  }

  const paintEdge = ({ edge, path }: WorkspaceMapOverviewEdge, nextPaths: typeof paths) => {
    const cached = paths.get(edge.id)
    const entry = cached?.path === path ? cached : { path, shape: new Path2D(path) }
    nextPaths.set(edge.id, entry)
    const paint = styles.get(edge.id)
    if (!paint) return
    context.strokeStyle = paint.stroke
    context.lineWidth = paint.width
    context.lineCap = paint.cap
    context.globalAlpha = paint.opacity
    context.setLineDash(paint.dash)
    context.lineDashOffset = paint.offset
    // Separate strokes preserve alpha accumulation where relations cross.
    context.stroke(entry.shape)
  }

  const schedule = (stylesChanged = false) => {
    dirty ||= stylesChanged
    forceStyles ||= stylesChanged
    if (!disposed && frame === undefined) frame = requestAnimationFrame(draw)
  }
  return {
    schedule,
    synchronize: () => {
      dirty = true
      schedule()
    },
    dispose: () => {
      disposed = true
      if (frame !== undefined) cancelAnimationFrame(frame)
      paths.clear()
      canvas.width = 0
      canvas.height = 0
    },
  }
}
