import type { Node } from '@xyflow/react'
import { useMemoizedFn } from 'ahooks'
import { useCallback, useMemo, useState } from 'react'

import type { GraphNodeData } from '@/logic/graph'
import { normalizeNavigableWebUrl } from '@/pages/web/webTabUrl'

export const getGraphWebViewUrl = (node: Node<GraphNodeData>) =>
  node.type === 'external' && typeof node.data.url === 'string'
    ? normalizeNavigableWebUrl(node.data.url)
    : null

export const useGraphWebViewState = (nodes: Node<GraphNodeData>[], layoutKey?: string) => {
  const nodeMembershipKey = useMemo(() => nodes.map((node) => node.id).join('\0'), [nodes])
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
  const activateCurrent = useMemoizedFn((nodeId: string, scope: symbol) => {
    // Retired node callbacks must not open a web view in a replacement graph.
    if (scope !== activationScope) return
    const canActivate = nodes.some((node) => node.id === nodeId && getGraphWebViewUrl(node))
    if (canActivate) setActive({ nodeId, scope })
  })
  const activate = useCallback(
    (nodeId: string) => activateCurrent(nodeId, activationScope),
    [activateCurrent, activationScope],
  )
  const deactivate = useCallback(() => setActive(null), [])

  return { activate, activeNodeId, deactivate }
}

export const useGraphRenderedNodes = (nodes: Node<GraphNodeData>[], layoutKey?: string) => {
  const webView = useGraphWebViewState(nodes, layoutKey)
  const { activate, deactivate } = webView
  const presentNodes = useMemo(() => {
    // Weak keys allow discarded nodes and their potentially large previews to be released.
    const cache = new WeakMap<
      Node<GraphNodeData>,
      { active: boolean; rendered: Node<GraphNodeData> }
    >()
    return (source: Node<GraphNodeData>[], activeNodeId: string | null) =>
      source.map((node) => {
        if (node.type !== 'preview' && node.type !== 'external') return node
        const active = node.type === 'external' && node.id === activeNodeId
        const cached = cache.get(node)
        if (cached && cached.active === active) return cached.rendered
        const url = getGraphWebViewUrl(node)
        let rendered = node
        if (node.type === 'preview') {
          rendered = { ...node, data: { ...node.data, graphResizable: true } }
        } else if (url) {
          rendered = {
            ...node,
            data: {
              ...node.data,
              url,
              webView: {
                active,
                activate,
                deactivate,
              },
            },
          }
        }
        cache.set(node, { active, rendered })
        return rendered
      })
  }, [activate, deactivate])
  const renderedNodes = useMemo(
    () => presentNodes(nodes, webView.activeNodeId),
    [nodes, presentNodes, webView.activeNodeId],
  )
  return { ...webView, renderedNodes }
}
