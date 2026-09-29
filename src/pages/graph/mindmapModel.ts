import type { Edge, Node, XYPosition } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'

export type MindmapDropPlacement = 'before' | 'after' | 'child'
export type MindmapDropIntent = { targetId: string; placement: MindmapDropPlacement }

export type MindmapModel = {
  nodes: Node<GraphNodeData>[]
  edges: Edge[]
  nodesById: Map<string, Node<GraphNodeData>>
  childrenById: Map<string, string[]>
  parentById: Map<string, string>
  roots: string[]
}

export const applyMindmapSelection = (nodes: Node<GraphNodeData>[], selectedId: string | null) => {
  let changed = false
  const nextNodes = nodes.map((node) => {
    const selected = selectedId !== null && node.id === selectedId
    if (Boolean(node.selected) === selected) return node
    changed = true
    return { ...node, selected }
  })
  return changed ? nextNodes : nodes
}

export const buildMindmapModel = (nodes: Node<GraphNodeData>[], edges: Edge[]): MindmapModel => {
  const headingNodes = nodes.filter((node) => node.type === 'heading')
  const nodesById = new Map(headingNodes.map((node) => [node.id, node]))
  const childrenById = new Map<string, string[]>()
  const parentById = new Map<string, string>()

  edges.forEach((edge) => {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) return
    const children = childrenById.get(edge.source) ?? []
    children.push(edge.target)
    childrenById.set(edge.source, children)
    parentById.set(edge.target, edge.source)
  })
  childrenById.forEach((children) =>
    children.sort((a, b) => lineOf(nodesById.get(a)) - lineOf(nodesById.get(b))),
  )

  return {
    nodes,
    edges,
    nodesById,
    childrenById,
    parentById,
    roots: headingNodes
      .filter((node) => !parentById.has(node.id))
      .sort(byLine)
      .map((node) => node.id),
  }
}

export const getMindmapVisibility = (model: MindmapModel, collapsedIds: Set<string>) => {
  const hiddenIds = new Set<string>()
  const hiddenCountById = new Map<string, number>()
  collapsedIds.forEach((nodeId) => {
    if (!model.nodesById.has(nodeId)) return
    const descendants = collectDescendants(model, nodeId)
    hiddenCountById.set(nodeId, descendants.size)
    descendants.forEach((id) => hiddenIds.add(id))
  })
  const visibleNodes = model.nodes.filter((node) => !hiddenIds.has(node.id))
  const visibleIds = new Set(visibleNodes.map((node) => node.id))
  const visibleEdges = model.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  )
  return { hiddenCountById, hiddenIds, visibleEdges, visibleNodes }
}

export const resolveMindmapDropIntent = (
  model: MindmapModel,
  draggedId: string,
  position: XYPosition,
): MindmapDropIntent | null => {
  const candidates = Array.from(model.nodesById.values()).filter(
    (node) => node.id !== draggedId && !isDescendant(model, draggedId, node.id),
  )
  const target = candidates
    .map((node) => ({ node, distance: pointDistance(position, centerOf(node)) }))
    .filter(({ distance }) => distance <= 240)
    .sort((a, b) => a.distance - b.distance)[0]?.node
  if (!target) return null

  const center = centerOf(target)
  const width = target.measured?.width ?? target.width ?? 180
  const height = target.measured?.height ?? target.height ?? 56
  const inside =
    Math.abs(position.x - center.x) <= width / 2 && Math.abs(position.y - center.y) <= height / 2
  if (inside) return { targetId: target.id, placement: 'child' }
  return { targetId: target.id, placement: position.y < center.y ? 'before' : 'after' }
}

const lineOf = (node: Node<GraphNodeData> | undefined) => Number(node?.data.line) || 0
const byLine = (a: Node<GraphNodeData>, b: Node<GraphNodeData>) => lineOf(a) - lineOf(b)
const centerOf = (node: Node<GraphNodeData>) => ({
  x: node.position.x + (node.measured?.width ?? node.width ?? 180) / 2,
  y: node.position.y + (node.measured?.height ?? node.height ?? 56) / 2,
})
const pointDistance = (a: XYPosition, b: XYPosition) => Math.hypot(a.x - b.x, a.y - b.y)

const collectDescendants = (model: MindmapModel, nodeId: string) => {
  const descendants = new Set<string>()
  const stack = [...(model.childrenById.get(nodeId) ?? [])]
  while (stack.length > 0) {
    const childId = stack.pop()
    if (!childId || descendants.has(childId)) continue
    descendants.add(childId)
    stack.push(...(model.childrenById.get(childId) ?? []))
  }
  return descendants
}

const isDescendant = (model: MindmapModel, ancestorId: string, nodeId: string) => {
  let current = model.parentById.get(nodeId)
  while (current) {
    if (current === ancestorId) return true
    current = model.parentById.get(current)
  }
  return false
}
