import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'

const ZOOM_STEP_IN = 1.16
const ZOOM_STEP_OUT = 1 / ZOOM_STEP_IN
const MIN_ZOOM = 0.15
const MAX_ZOOM = 2.2

type GraphFlowInstance = ReactFlowInstance<Node<GraphNodeData>, Edge> | null

export const fitGraphHeading = (
  flowInstance: GraphFlowInstance,
  visibleNodes: Node<GraphNodeData>[],
  headingId: string | null,
) => {
  if (!flowInstance || !headingId) return
  const selectedNode = visibleNodes.find((node) => node.id === headingId)
  if (!selectedNode) return
  flowInstance.fitView({
    nodes: [selectedNode],
    padding: 0.32,
    duration: motionDuration(120),
  })
}

export const fitVisibleGraph = (flowInstance: GraphFlowInstance, visibleNodeCount: number) => {
  if (!flowInstance || visibleNodeCount === 0) return
  flowInstance.fitView({ padding: 0.22, duration: motionDuration(160) })
}

export const adjustGraphZoom = (
  flowInstance: GraphFlowInstance,
  direction: 'in' | 'out',
  selectedNode?: Node<GraphNodeData>,
) => {
  if (!flowInstance) return
  const viewport = flowInstance.getViewport()
  const nextZoom =
    direction === 'in'
      ? Math.min(MAX_ZOOM, viewport.zoom * ZOOM_STEP_IN)
      : Math.max(MIN_ZOOM, viewport.zoom * ZOOM_STEP_OUT)
  if (!selectedNode) {
    flowInstance.setViewport({ ...viewport, zoom: nextZoom }, { duration: motionDuration(120) })
    return
  }
  const centerX =
    selectedNode.position.x + (selectedNode.measured?.width ?? selectedNode.width ?? 180) / 2
  const centerY =
    selectedNode.position.y + (selectedNode.measured?.height ?? selectedNode.height ?? 56) / 2
  const screenX = centerX * viewport.zoom + viewport.x
  const screenY = centerY * viewport.zoom + viewport.y
  flowInstance.setViewport(
    { x: screenX - centerX * nextZoom, y: screenY - centerY * nextZoom, zoom: nextZoom },
    { duration: motionDuration(120) },
  )
}

const motionDuration = (duration: number) =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 0
    : duration
