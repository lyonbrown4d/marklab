import { useCallback } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { useReactFlow } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'

export const useWorkspaceMapNodeTools = (nodeId: string, pinned: boolean) => {
  const flow = useReactFlow<Node<GraphNodeData>, Edge>()
  const focusRelations = useCallback(() => {
    const relatedIds = new Set([nodeId])
    flow.getEdges().forEach((edge) => {
      if (edge.source === nodeId) relatedIds.add(edge.target)
      if (edge.target === nodeId) relatedIds.add(edge.source)
    })
    const relatedNodes = flow.getNodes().filter((node) => relatedIds.has(node.id))
    if (relatedNodes.length > 0) {
      void flow.fitView({ duration: 180, maxZoom: 1.15, nodes: relatedNodes, padding: 0.28 })
    }
  }, [flow, nodeId])
  const togglePinned = useCallback(() => {
    const node = flow.getNode(nodeId)
    if (!node) return
    const nextPinned = !node.data.workspaceMapPinned
    flow.updateNode(nodeId, {
      data: { ...node.data, workspaceMapPinned: nextPinned },
      draggable: !nextPinned,
    })
  }, [flow, nodeId])

  return { focusRelations, pinned, togglePinned }
}
