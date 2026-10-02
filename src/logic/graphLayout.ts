import type { ELK, ElkNode } from 'elkjs/lib/elk.bundled.js'
import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { getGraphNodeLayoutSize } from '@/logic/graphLayoutMetrics'

let elkPromise: Promise<ELK> | undefined

const loadElk = () => {
  elkPromise ??= import('elkjs/lib/elk.bundled.js').then(({ default: Elk }) => new Elk())
  return elkPromise
}

export const layoutGraphWithElk = async (
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
): Promise<Node<GraphNodeData>[]> => {
  if (nodes.length === 0) return nodes

  const elk = await loadElk()
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
