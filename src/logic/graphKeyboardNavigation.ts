import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { isContainsEdge } from '@/logic/graphVisibility'

export const getFirstHeadingId = (nodes: Node<GraphNodeData>[]) =>
  getLineSortedHeadings(nodes)[0]?.id ?? null

export const getLastHeadingId = (nodes: Node<GraphNodeData>[]) => {
  const headings = getLineSortedHeadings(nodes)
  return headings[headings.length - 1]?.id ?? null
}

export const getPreviousHeadingId = (nodes: Node<GraphNodeData>[], selectedId: string) => {
  const headings = getLineSortedHeadings(nodes)
  const index = headings.findIndex((node) => node.id === selectedId)
  return index > 0 ? headings[index - 1]?.id : null
}

export const getNextHeadingId = (nodes: Node<GraphNodeData>[], selectedId: string) => {
  const headings = getLineSortedHeadings(nodes)
  const index = headings.findIndex((node) => node.id === selectedId)
  return index >= 0 && index < headings.length - 1 ? headings[index + 1]?.id : null
}

export const getParentHeadingId = (
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  selectedId: string,
) => {
  const parentId = edges.find((edge) => isContainsEdge(edge) && edge.target === selectedId)?.source
  if (!parentId) return null
  return nodes.some((node) => node.id === parentId && node.type === 'heading') ? parentId : null
}

export const getFirstChildHeadingId = (
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  selectedId: string,
) => {
  const childIds = new Set(
    edges
      .filter((edge) => isContainsEdge(edge) && edge.source === selectedId)
      .map((edge) => edge.target),
  )
  return getLineSortedHeadings(nodes).find((node) => childIds.has(node.id))?.id ?? null
}

export type SpatialDirection = 'up' | 'down' | 'left' | 'right'

export const getSpatialHeadingId = (
  nodes: Node<GraphNodeData>[],
  selectedId: string,
  direction: SpatialDirection,
) => {
  const selected = nodes.find((node) => node.id === selectedId)
  if (!selected) return null
  const origin = getNodeCenter(selected)
  return (
    nodes
      .filter((node) => node.type === 'heading' && node.id !== selectedId)
      .map((node) => {
        const center = getNodeCenter(node)
        const dx = center.x - origin.x
        const dy = center.y - origin.y
        const primary =
          direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy
        const cross = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx)
        return { id: node.id, primary, score: primary + cross * 1.75 }
      })
      .filter((candidate) => candidate.primary > 0)
      .sort((a, b) => a.score - b.score)[0]?.id ?? null
  )
}

const getLineSortedHeadings = (nodes: Node<GraphNodeData>[]) => {
  return nodes
    .filter((node) => node.type === 'heading' && typeof node.data.line === 'number')
    .sort((left, right) => Number(left.data.line) - Number(right.data.line))
}

const getNodeCenter = (node: Node<GraphNodeData>) => ({
  x: node.position.x + (node.measured?.width ?? node.width ?? 180) / 2,
  y: node.position.y + (node.measured?.height ?? node.height ?? 56) / 2,
})
