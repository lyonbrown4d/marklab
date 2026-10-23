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
  let geometryDirty = true
  let geometry: WorkspaceMapOverviewEdge[] = []
  let viewport: number[] = []

  const draw = () => {
    frame = undefined
    if (disposed) return
    const state = getState()
    const previous = geometry
    if (geometryDirty) {
      geometry = select(state)
      geometryDirty = false
    }
    const sameGeometry =
      geometry.length === previous.length &&
      geometry.every((item, index) => item === previous[index])
    const ratio = window.devicePixelRatio || 1
    const nextViewport = [state.width, state.height, ratio, ...state.transform]
    if (
      !dirty &&
      !animating &&
      sameGeometry &&
      nextViewport.every((value, index) => value === viewport[index])
    )
      return
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
    // Camera movement reuses world-space paths. Allocate/prune the path map only
    // when visible relations or endpoint geometry actually change.
    if (!sameGeometry) {
      const nextPaths = new Map<string, { path: string; shape: Path2D }>()
      for (const { edge, path } of geometry) {
        const cached = paths.get(edge.id)
        nextPaths.set(edge.id, cached?.path === path ? cached : { path, shape: new Path2D(path) })
      }
      paths = nextPaths
    }
    for (const item of geometry) paintEdge(item)
    viewport = nextViewport
    if (animating) requestFrame()
  }

  const paintEdge = ({ edge }: WorkspaceMapOverviewEdge) => {
    const entry = paths.get(edge.id)
    const paint = styles.get(edge.id)
    if (!entry || !paint) return
    context.strokeStyle = paint.stroke
    context.lineWidth = paint.width
    context.lineCap = paint.cap
    context.globalAlpha = paint.opacity
    context.setLineDash(paint.dash)
    context.lineDashOffset = paint.offset
    // Separate strokes preserve alpha accumulation where relations cross.
    context.stroke(entry.shape)
  }

  const requestFrame = () => {
    if (!disposed && frame === undefined) frame = requestAnimationFrame(draw)
  }
  const schedule = (stylesChanged = false) => {
    geometryDirty = true
    dirty ||= stylesChanged
    forceStyles ||= stylesChanged
    requestFrame()
  }
  return {
    schedule,
    synchronize: () => {
      dirty = true
      requestFrame()
    },
    dispose: () => {
      disposed = true
      if (frame !== undefined) cancelAnimationFrame(frame)
      paths.clear()
      geometry = []
      visible = []
      canvas.width = 0
      canvas.height = 0
    },
  }
}
