import type { Node } from '@xyflow/react'
import { useCallback, useState } from 'react'

import type { GraphNodeData } from '@/logic/graph'
import { normalizeNavigableWebUrl } from '@/pages/web/webTabUrl'

export const getGraphWebViewUrl = (node: Node<GraphNodeData>) =>
  node.type === 'external' && typeof node.data.url === 'string'
    ? normalizeNavigableWebUrl(node.data.url)
    : null

export const useGraphWebViewState = (nodes: Node<GraphNodeData>[], layoutKey?: string) => {
  const [active, setActive] = useState<{
    layoutKey?: string
    nodeId: string
  } | null>(null)
  const hasCurrentActiveNode =
    active !== null &&
    active.layoutKey === layoutKey &&
    nodes.some((node) => node.id === active.nodeId)
  const activeNodeId = hasCurrentActiveNode ? active.nodeId : null
  const activate = useCallback(
    (nodeId: string) => {
      const canActivate = nodes.some((node) => node.id === nodeId && getGraphWebViewUrl(node))
      if (canActivate) setActive({ layoutKey, nodeId })
    },
    [layoutKey, nodes],
  )
  const deactivate = useCallback(() => setActive(null), [])

  return { activate, activeNodeId, deactivate }
}
