import type { Node } from '@xyflow/react'

export const mergeGraphNodePositions = <T extends Record<string, unknown>>(
  nextNodes: Node<T>[],
  currentNodes: Node<T>[],
  preservePositions: boolean,
) => {
  if (!preservePositions) return nextNodes

  const currentById = new Map(currentNodes.map((node) => [node.id, node]))
  return nextNodes.map((node) => {
    const current = currentById.get(node.id)
    if (!current) return node

    return {
      ...node,
      position: current.position,
      selected: current.selected,
      dragging: current.dragging,
    }
  })
}

export const mergeDeferredGraphLayout = <T extends Record<string, unknown>>(
  layoutNodes: Node<T>[],
  currentNodes: Node<T>[],
  requestedNodes: Node<T>[],
) => {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]))
  const requestedById = new Map(requestedNodes.map((node) => [node.id, node]))

  return layoutNodes.map((node) => {
    const current = currentById.get(node.id)
    if (!current) return node

    const requested = requestedById.get(node.id)
    const positionChanged =
      !requested ||
      current.position.x !== requested.position.x ||
      current.position.y !== requested.position.y

    return {
      ...node,
      position: current.dragging || positionChanged ? current.position : node.position,
      selected: current.selected,
      dragging: current.dragging,
    }
  })
}

export const hasGraphInteractionSinceLayoutRequest = <T extends Record<string, unknown>>(
  currentNodes: Node<T>[],
  requestedNodes: Node<T>[],
) => {
  const requestedById = new Map(requestedNodes.map((node) => [node.id, node]))
  return currentNodes.some((current) => {
    const requested = requestedById.get(current.id)
    if (!requested) return false
    return (
      Boolean(current.dragging) ||
      current.position.x !== requested.position.x ||
      current.position.y !== requested.position.y
    )
  })
}
