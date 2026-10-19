import { getBezierPath } from '@xyflow/react'
import type { Edge, ReactFlowState } from '@xyflow/react'
import { getEdgePosition, isEdgeVisible } from '@xyflow/system'

type EdgePosition = NonNullable<ReturnType<typeof getEdgePosition>>
export type GeometryState = Pick<
  ReactFlowState,
  'nodeLookup' | 'width' | 'height' | 'transform' | 'connectionMode'
>

export type WorkspaceMapOverviewEdge = {
  edge: Edge
  path: string
  position: EdgePosition
}

const samePosition = (left: EdgePosition, right: EdgePosition) =>
  left.sourceX === right.sourceX &&
  left.sourceY === right.sourceY &&
  left.targetX === right.targetX &&
  left.targetY === right.targetY &&
  left.sourcePosition === right.sourcePosition &&
  left.targetPosition === right.targetPosition

// Internal node maps are mutated in place, including handle-only measurements.
// Read endpoint values on each notification; retain paths only for current edges.
export const createWorkspaceMapOverviewEdgeSelector = (edges: Edge[]) => {
  let cache = new Map<string, WorkspaceMapOverviewEdge>()
  return (state: GeometryState): WorkspaceMapOverviewEdge[] => {
    const nextCache = new Map<string, WorkspaceMapOverviewEdge>()
    const visible: WorkspaceMapOverviewEdge[] = []
    if (!state.width || !state.height) {
      cache = nextCache
      return visible
    }
    for (const edge of edges) {
      if (edge.hidden) continue
      const sourceNode = state.nodeLookup.get(edge.source)
      const targetNode = state.nodeLookup.get(edge.target)
      if (
        !sourceNode ||
        !targetNode ||
        sourceNode.hidden ||
        targetNode.hidden ||
        !isEdgeVisible({
          sourceNode,
          targetNode,
          width: state.width,
          height: state.height,
          transform: state.transform,
        })
      )
        continue
      const position = getEdgePosition({
        id: edge.id,
        sourceNode,
        targetNode,
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null,
        connectionMode: state.connectionMode,
      })
      if (!position) continue
      const previous = cache.get(edge.id)
      const item =
        previous?.edge === edge && samePosition(previous.position, position)
          ? previous
          : { edge, path: getBezierPath(position)[0], position }
      nextCache.set(edge.id, item)
      visible.push(item)
    }
    cache = nextCache
    return visible
  }
}

export const sameWorkspaceMapOverviewEdges = (
  left: WorkspaceMapOverviewEdge[],
  right: WorkspaceMapOverviewEdge[],
) => left.length === right.length && left.every((item, index) => item === right[index])

export const hideWorkspaceMapOverviewEdges = (edges: Edge[]) =>
  edges.map((edge) => (edge.hidden ? edge : { ...edge, hidden: true }))
