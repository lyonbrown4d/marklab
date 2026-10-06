import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'

const NODE_PRESENTATION_CLASSES = new Set([
  'workspace-map-flow-node--dimmed',
  'workspace-map-flow-node--neighbor',
  'workspace-map-flow-node--spotlight',
])
const EDGE_PRESENTATION_CLASSES = new Set([
  'workspace-map-flow-edge--connected',
  'workspace-map-flow-edge--muted',
])
const MAX_EMPHASIZED_EDGES = 12

export type WorkspaceMapNeighborhood = {
  edgeIds: Set<string>
  engagedNodeId: string | null
  nodeIds: Set<string>
}

export const createWorkspaceMapNeighborhood = (
  edges: Edge[],
  engagedNodeId: string | null,
): WorkspaceMapNeighborhood => {
  const edgeIds = new Set<string>()
  const nodeIds = new Set<string>(engagedNodeId ? [engagedNodeId] : [])
  if (!engagedNodeId) return { edgeIds, engagedNodeId, nodeIds }

  for (const edge of edges) {
    if (edge.source !== engagedNodeId && edge.target !== engagedNodeId) continue
    if (edgeIds.size < MAX_EMPHASIZED_EDGES) edgeIds.add(edge.id)
    nodeIds.add(edge.source)
    nodeIds.add(edge.target)
  }
  return { edgeIds, engagedNodeId, nodeIds }
}

const withPresentationClass = (
  className: string | undefined,
  presentationClasses: Set<string>,
  nextClass: string,
) => {
  const classes = withoutPresentationClasses(className, presentationClasses)
  return [classes, nextClass].filter(Boolean).join(' ')
}

const withoutPresentationClasses = (
  className: string | undefined,
  presentationClasses: Set<string>,
) => {
  const classes = (className ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .filter((name) => !presentationClasses.has(name))
  return classes.join(' ') || undefined
}

export const presentWorkspaceMapNeighborhoodNodes = (
  nodes: Node<GraphNodeData>[],
  neighborhood: WorkspaceMapNeighborhood,
): Node<GraphNodeData>[] => {
  if (!neighborhood.engagedNodeId) {
    let changed = false
    const clearedNodes = nodes.map((node) => {
      const className = withoutPresentationClasses(node.className, NODE_PRESENTATION_CLASSES)
      if (className === node.className) return node
      changed = true
      return { ...node, className }
    })
    return changed ? clearedNodes : nodes
  }
  return nodes.map((node) => {
    const relationClass =
      node.id === neighborhood.engagedNodeId
        ? 'workspace-map-flow-node--spotlight'
        : neighborhood.nodeIds.has(node.id)
          ? 'workspace-map-flow-node--neighbor'
          : 'workspace-map-flow-node--dimmed'
    return {
      ...node,
      className: withPresentationClass(node.className, NODE_PRESENTATION_CLASSES, relationClass),
    }
  })
}

export const presentWorkspaceMapNeighborhoodEdges = (
  edges: Edge[],
  neighborhood: WorkspaceMapNeighborhood,
): Edge[] => {
  if (!neighborhood.engagedNodeId) return edges
  return edges.map((edge) => ({
    ...edge,
    className: withPresentationClass(
      edge.className,
      EDGE_PRESENTATION_CLASSES,
      neighborhood.edgeIds.has(edge.id)
        ? 'workspace-map-flow-edge--connected'
        : 'workspace-map-flow-edge--muted',
    ),
  }))
}
