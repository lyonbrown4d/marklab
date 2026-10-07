import type { FsGraph, FsGraphNode } from '@electron/services/workspace/types'

export const isGraphTopologyOnly = (graph: FsGraph): boolean =>
  graph.nodes.every(
    (node) =>
      node.content === undefined &&
      node.content_blocks === undefined &&
      node.content_start_line === undefined &&
      node.content_end_line === undefined,
  )

export const graphTopologyOnly = (graph: FsGraph): FsGraph =>
  isGraphTopologyOnly(graph) ? graph : { ...graph, nodes: graph.nodes.map(stripNodeContent) }

const stripNodeContent = (node: FsGraphNode): FsGraphNode => {
  if (
    node.content === undefined &&
    node.content_blocks === undefined &&
    node.content_start_line === undefined &&
    node.content_end_line === undefined
  ) {
    return node
  }
  const topologyNode = { ...node }
  delete topologyNode.content
  delete topologyNode.content_blocks
  delete topologyNode.content_start_line
  delete topologyNode.content_end_line
  return topologyNode
}
