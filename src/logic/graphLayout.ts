import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode } from 'elkjs/lib/elk.bundled.js'
import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'

const DEFAULT_NODE_WIDTH = 190
const DEFAULT_NODE_HEIGHT = 62
const HEADING_NODE_WIDTH = 180
const HEADING_NODE_HEIGHT = 56
const FILE_NODE_WIDTH = 200
const FILE_NODE_HEIGHT = 54
export const FULL_HEADING_NODE_MAX_HEIGHT = 360

const elk = new ELK()

export const getGraphNodeLayoutSize = (node: Node<GraphNodeData>) => {
  if (node.measured?.width && node.measured.height) {
    return { width: node.measured.width, height: node.measured.height }
  }

  if (node.id.startsWith('file:')) {
    return { width: FILE_NODE_WIDTH, height: FILE_NODE_HEIGHT }
  }
  if (node.type === 'heading' || node.id.startsWith('heading:')) {
    if (node.data.contentMode === 'full') {
      return { width: 260, height: estimateHeadingNodeHeight(node) }
    }
    if (node.data.contentMode === 'summary' && node.data.content) {
      return { width: 240, height: 124 }
    }
    return { width: HEADING_NODE_WIDTH, height: HEADING_NODE_HEIGHT }
  }
  if (node.type === 'preview' || node.id.startsWith('preview:')) {
    return { width: 320, height: 118 }
  }
  return { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT }
}

export const createGraphNodeLayoutSignature = (node: Node<GraphNodeData>): string => {
  const { width, height } = getGraphNodeLayoutSize(node)
  return [
    node.id,
    node.type ?? '',
    node.data.contentMode ?? '',
    width,
    height,
    node.data.label.length,
  ].join(':')
}

export const layoutGraphWithElk = async (
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
): Promise<Node<GraphNodeData>[]> => {
  if (nodes.length === 0) return nodes

  const knownNodeIds = new Set(nodes.map((node) => node.id))
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.spacing.edgeNodeBetweenLayers': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '220',
      'elk.spacing.edgeEdge': '24',
      'elk.spacing.edgeNode': '36',
      'elk.spacing.nodeNode': '72',
    },
    children: nodes.map((node) => ({
      id: node.id,
      ...getGraphNodeLayoutSize(node),
    })),
    edges: edges
      .filter((edge) => knownNodeIds.has(edge.source) && knownNodeIds.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
  }

  const layout = await elk.layout(graph)
  const layoutChildren = new Map((layout.children ?? []).map((node) => [node.id, node]))

  return nodes.map((node) => {
    const layoutNode = layoutChildren.get(node.id)
    if (layoutNode?.x == null || layoutNode.y == null) return node
    return {
      ...node,
      position: {
        x: layoutNode.x,
        y: layoutNode.y,
      },
    }
  })
}

const estimateHeadingNodeHeight = (node: Node<GraphNodeData>) => {
  const blocks = node.data.contentBlocks
  if (!blocks?.length) return 170

  const blockHeight = blocks.reduce((height, block) => {
    if (block.kind === 'code') return height + 90
    if (block.kind === 'list') return height + Math.min(120, 28 + block.items.length * 22)
    if (block.kind === 'divider') return height + 34
    if (block.kind === 'blockquote') return height + 56
    if (block.kind === 'table') return height + 70
    return height + 44
  }, 52)

  return Math.min(FULL_HEADING_NODE_MAX_HEIGHT, Math.max(130, blockHeight))
}
