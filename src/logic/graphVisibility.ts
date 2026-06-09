import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'

export const buildContainsChildrenMap = (edges: Edge[]) => {
  const childrenByParent = new Map<string, string[]>()

  edges.forEach((edge) => {
    if (!isContainsEdge(edge)) return
    const children = childrenByParent.get(edge.source)
    if (!children) {
      childrenByParent.set(edge.source, [edge.target])
      return
    }
    children.push(edge.target)
  })

  return childrenByParent
}

export const getDescendants = (
  startIds: readonly string[],
  childrenByParent: Map<string, string[]>,
) => {
  const descendants = new Set<string>()
  const stack = [...startIds]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    const children = childrenByParent.get(current)
    if (!children) continue

    children.forEach((childId) => {
      if (descendants.has(childId)) return
      descendants.add(childId)
      stack.push(childId)
    })
  }

  return descendants
}

export const getHiddenNodeIds = (
  nodes: Node<GraphNodeData>[],
  collapsedNodeIds: Set<string>,
  childrenByParent: Map<string, string[]>,
) => {
  const existingNodeIds = new Set(nodes.map((node) => node.id))
  const activeCollapsedNodeIds = Array.from(collapsedNodeIds).filter((nodeId) =>
    existingNodeIds.has(nodeId),
  )

  return getDescendants(activeCollapsedNodeIds, childrenByParent)
}

export const getVisibleGraphElements = (
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  hiddenNodeIds: Set<string>,
) => {
  const visibleNodes = nodes.filter((node) => !hiddenNodeIds.has(node.id))
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const visibleEdges = edges.filter(
    (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
  )

  return { visibleEdges, visibleNodes }
}

const getEdgeKind = (edge: Edge) => {
  if (!edge.data || typeof edge.data !== 'object') return null
  const kind = (edge.data as { kind?: unknown }).kind
  return typeof kind === 'string' ? kind : null
}

export const isContainsEdge = (edge: Edge) => {
  const kind = getEdgeKind(edge)
  if (kind) return kind === 'contains'
  return edge.target.startsWith('heading:') && edge.source.startsWith('heading:')
}
