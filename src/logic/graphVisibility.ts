import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'

export const buildContainsChildrenMap = (edges: Edge[]) => {
  const childSetsByParent = new Map<string, Set<string>>()

  edges.forEach((edge) => {
    if (!isContainsEdge(edge)) return
    const children = childSetsByParent.get(edge.source) ?? new Set<string>()
    children.add(edge.target)
    childSetsByParent.set(edge.source, children)
  })

  return new Map(
    Array.from(childSetsByParent, ([parentId, childIds]) => [parentId, Array.from(childIds)]),
  )
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

  startIds.forEach((startId) => descendants.delete(startId))

  return descendants
}

export const buildDescendantCountMap = (childrenByParent: Map<string, string[]>) => {
  if (!isStrictForest(childrenByParent)) {
    return new Map(
      Array.from(childrenByParent.keys(), (nodeId) => [
        nodeId,
        getDescendants([nodeId], childrenByParent).size,
      ]),
    )
  }
  const counts = new Map<string, number>()
  const visited = new Set<string>()

  childrenByParent.forEach((_children, rootId) => {
    if (visited.has(rootId)) return
    const stack: Array<{ expanded: boolean; id: string }> = [{ expanded: false, id: rootId }]
    while (stack.length > 0) {
      const current = stack.pop()
      if (!current) continue
      if (current.expanded) {
        const count = (childrenByParent.get(current.id) ?? []).reduce(
          (total, childId) => total + 1 + (counts.get(childId) ?? 0),
          0,
        )
        counts.set(current.id, count)
        continue
      }
      if (visited.has(current.id)) continue
      visited.add(current.id)
      stack.push({ expanded: true, id: current.id })
      const children = [...(childrenByParent.get(current.id) ?? [])].reverse()
      children.forEach((childId) => {
        if (!visited.has(childId)) stack.push({ expanded: false, id: childId })
      })
    }
  })

  return counts
}

const isStrictForest = (childrenByParent: Map<string, string[]>) => {
  const nodeIds = new Set<string>()
  const incomingCount = new Map<string, number>()
  childrenByParent.forEach((children, parentId) => {
    nodeIds.add(parentId)
    children.forEach((childId) => {
      nodeIds.add(childId)
      const count = (incomingCount.get(childId) ?? 0) + 1
      incomingCount.set(childId, count)
    })
  })
  if (Array.from(incomingCount.values()).some((count) => count > 1)) return false

  const queue = Array.from(nodeIds).filter((nodeId) => !incomingCount.has(nodeId))
  let visitedCount = 0
  while (queue.length > 0) {
    const nodeId = queue.pop()
    if (!nodeId) continue
    visitedCount += 1
    const children = childrenByParent.get(nodeId) ?? []
    children.forEach((childId) => {
      const nextCount = (incomingCount.get(childId) ?? 0) - 1
      incomingCount.set(childId, nextCount)
      if (nextCount === 0) queue.push(childId)
    })
  }
  return visitedCount === nodeIds.size
}

export const getSelectionAfterBranchCollapse = (
  selectedId: string | null,
  branchId: string,
  childrenByParent: Map<string, string[]>,
) =>
  selectedId && getDescendants([branchId], childrenByParent).has(selectedId) ? branchId : selectedId

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
