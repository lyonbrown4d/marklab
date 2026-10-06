import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import type { Node, NodeChange, OnNodesChange, ReactFlowInstance } from '@xyflow/react'

import type { GraphNodeData } from '@/logic/graph'
import { useWorkspaceMapLayoutPersistence } from '@/pages/workspace-map/useWorkspaceMapLayoutPersistence'
import { markWorkspaceMapUserModified } from '@/pages/workspace-map/workspaceMapLayoutPersistence'
import type { GraphLayoutRequest } from '@/services/graphLayoutApi'

type Options = {
  disclosedNodes: Node<GraphNodeData>[]
  enabled: boolean
  flow: ReactFlowInstance<Node<GraphNodeData>> | null
  nodes: Node<GraphNodeData>[]
  onNodesChange: OnNodesChange<Node<GraphNodeData>>
  request?: GraphLayoutRequest
  setNodes: Dispatch<SetStateAction<Node<GraphNodeData>[]>>
}

export const useWorkspaceMapCanvasPersistence = ({
  disclosedNodes,
  enabled,
  flow,
  nodes,
  onNodesChange,
  request,
  setNodes,
}: Options) => {
  const persistenceNodes = useMemo(() => {
    const disclosedById = new Map(disclosedNodes.map((node) => [node.id, node]))
    return nodes.map((node) => {
      const disclosure = disclosedById.get(node.id)?.data.workspaceMapDisclosure
      return disclosure
        ? { ...node, data: { ...node.data, workspaceMapDisclosure: disclosure } }
        : node
    })
  }, [disclosedNodes, nodes])
  const persistence = useWorkspaceMapLayoutPersistence({
    enabled,
    flow,
    nodes: persistenceNodes,
    request,
  })
  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<GraphNodeData>>[]) => {
      onNodesChange(changes)
      const modifiedNodeIds = new Set(
        changes
          .filter((change) => change.type === 'position' || change.type === 'dimensions')
          .map((change) => change.id),
      )
      if (modifiedNodeIds.size > 0) {
        setNodes((current) => markWorkspaceMapUserModified(current, modifiedNodeIds))
      }
    },
    [onNodesChange, setNodes],
  )

  return { handleNodesChange, scheduleViewportSave: persistence.scheduleViewportSave }
}
