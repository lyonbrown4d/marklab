import type { Edge, Node } from '@xyflow/react'
import { graphlib, layout as dagreLayout } from '@dagrejs/dagre'
import type { GraphNodeData } from '@/logic/graph'
import { getGraphNodeLayoutSize } from '@/logic/graphLayoutMetrics'

export type DagreLayoutOptions = {
  rankdir: 'TB' | 'BT' | 'LR' | 'RL'
  ranksep: number
  nodesep: number
  edgesep?: number
}

type DagreLayout = (graph: graphlib.Graph) => void

const DAGRE_MARGIN = 120
const DAGRE_SYNC_EDGE_LIMIT = 600
const DAGRE_SYNC_NODE_LIMIT = 300
const GRID_GAP = 80

export const applyDagreLayout = (
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  options: DagreLayoutOptions,
  layout: DagreLayout = dagreLayout,
) => {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const layoutEdgePairs = new Set<string>()
  const layoutEdges = edges.filter((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false
    const pair = `${edge.source.length}:${edge.source}${edge.target}`
    if (layoutEdgePairs.has(pair)) return false
    layoutEdgePairs.add(pair)
    return true
  })

  if (nodes.length > DAGRE_SYNC_NODE_LIMIT || layoutEdges.length > DAGRE_SYNC_EDGE_LIMIT) {
    applyGridLayout(nodes)
    return
  }

  const graph = new graphlib.Graph({ multigraph: true })
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ ...options, marginx: DAGRE_MARGIN, marginy: DAGRE_MARGIN })

  nodes.forEach((node) => graph.setNode(node.id, getGraphNodeLayoutSize(node)))

  layoutEdges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target, {}, edge.id)
  })

  try {
    layout(graph)
  } catch (error) {
    console.warn('Dagre graph layout failed.', error)
    applyGridLayout(nodes)
    return
  }

  nodes.forEach((node) => {
    const layoutNode = graph.node(node.id) as { x?: number; y?: number } | undefined
    const size = getGraphNodeLayoutSize(node)
    node.position =
      typeof layoutNode?.x === 'number' && typeof layoutNode.y === 'number'
        ? { x: layoutNode.x - size.width / 2, y: layoutNode.y - size.height / 2 }
        : { x: 0, y: 0 }
  })
}

const applyGridLayout = (nodes: Node<GraphNodeData>[]) => {
  const sizes = nodes.map(getGraphNodeLayoutSize)
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  const cellWidth = Math.max(...sizes.map((size) => size.width), 0) + GRID_GAP
  const cellHeight = Math.max(...sizes.map((size) => size.height), 0) + GRID_GAP

  nodes.forEach((node, index) => {
    node.position = {
      x: (index % columns) * cellWidth,
      y: Math.floor(index / columns) * cellHeight,
    }
  })
}
