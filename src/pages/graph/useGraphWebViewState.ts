import type { Node } from '@xyflow/react'
import { useCallback, useMemo, useState } from 'react'

import type { GraphNodeData } from '@/logic/graph'
import { normalizeNavigableWebUrl } from '@/pages/web/webTabUrl'

export const getGraphWebViewUrl = (node: Node<GraphNodeData>) =>
  node.type === 'external' && typeof node.data.url === 'string'
    ? normalizeNavigableWebUrl(node.data.url)
    : null

export const useGraphWebViewState = (nodes: Node<GraphNodeData>[], layoutKey?: string) => {
  const nodeMembershipKey = nodes.map((node) => node.id).join('\0')
  const activationScope = useMemo(
    () => Symbol(`graph-web-view:${layoutKey ?? ''}:${nodeMembershipKey.length}`),
    [layoutKey, nodeMembershipKey],
  )
  const [active, setActive] = useState<{
    nodeId: string
    scope: symbol
  } | null>(null)
  const hasCurrentActiveNode =
    active !== null &&
    active.scope === activationScope &&
    nodes.some((node) => node.id === active.nodeId)
  const activeNodeId = hasCurrentActiveNode ? active.nodeId : null
  const activate = useCallback(
    (nodeId: string) => {
      const canActivate = nodes.some((node) => node.id === nodeId && getGraphWebViewUrl(node))
      if (canActivate) setActive({ nodeId, scope: activationScope })
    },
    [activationScope, nodes],
  )
  const deactivate = useCallback(() => setActive(null), [])

  return { activate, activeNodeId, deactivate }
}

export const useGraphRenderedNodes = (nodes: Node<GraphNodeData>[], layoutKey?: string) => {
  const webView = useGraphWebViewState(nodes, layoutKey)
  const renderedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const url = getGraphWebViewUrl(node)
        if (node.type === 'preview') {
          return { ...node, data: { ...node.data, graphResizable: true } }
        }
        return url
          ? {
              ...node,
              data: {
                ...node.data,
                url,
                webView: {
                  active: webView.activeNodeId === node.id,
                  activate: webView.activate,
                  deactivate: webView.deactivate,
                },
              },
            }
          : node
      }),
    [nodes, webView.activate, webView.activeNodeId, webView.deactivate],
  )
  return { ...webView, renderedNodes }
}
