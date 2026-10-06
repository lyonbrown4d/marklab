import type { Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { getGraphNodeLayoutSize } from '@/logic/graphLayoutMetrics'

export type WorkspaceMapGroupRegion = {
  colorIndex: number
  height: number
  key: string
  label: string
  nodeCount: number
  testId: string
  width: number
  x: number
  y: number
}

const HORIZONTAL_PADDING = 48
const TOP_PADDING = 68
const BOTTOM_PADDING = 44
const GROUP_COLORS = 6

export const createWorkspaceMapGroupRegions = (
  nodes: Node<GraphNodeData>[],
): WorkspaceMapGroupRegion[] => {
  const grouped = new Map<string, Node<GraphNodeData>[]>()
  nodes.forEach((node) => {
    const key = node.data.workspaceGroup?.key
    if (!key || node.type === 'external') return
    const members = grouped.get(key) ?? []
    members.push(node)
    grouped.set(key, members)
  })

  return [...grouped.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([key, members]) => createRegion(key, members))
    .sort((left, right) => left.label.localeCompare(right.label))
}

const createRegion = (key: string, nodes: Node<GraphNodeData>[]): WorkspaceMapGroupRegion => {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  nodes.forEach((node) => {
    const size = getGraphNodeLayoutSize(node)
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + size.width)
    maxY = Math.max(maxY, node.position.y + size.height)
  })
  const label = nodes[0]?.data.workspaceGroup?.label ?? key
  return {
    colorIndex: stableColorIndex(key),
    height: maxY - minY + TOP_PADDING + BOTTOM_PADDING,
    key,
    label,
    nodeCount: nodes.length,
    testId: `workspace-map-group-${slug(key)}`,
    width: maxX - minX + HORIZONTAL_PADDING * 2,
    x: minX - HORIZONTAL_PADDING,
    y: minY - TOP_PADDING,
  }
}

const stableColorIndex = (key: string) => {
  let hash = 0
  for (const character of key) hash = Math.imul(hash, 31) + (character.codePointAt(0) ?? 0)
  return Math.abs(hash) % GROUP_COLORS
}

const slug = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
