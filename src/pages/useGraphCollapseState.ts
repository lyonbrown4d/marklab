import { useCallback, useMemo, useState } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { useLatest } from 'ahooks'
import type { GraphNodeData } from '@/logic/graph'
import {
  buildContainsChildrenMap,
  buildDescendantCountMap,
  getDescendants,
  getHiddenNodeIds,
  getSelectionAfterBranchCollapse,
  getVisibleGraphElements,
} from '@/logic/graphVisibility'
import { useI18n } from '@/i18n/useI18n'

type GraphCollapseOptions = {
  onSelectionChange?: (nodeId: string | null) => void
  selectedNodeId?: string | null
}

export const useGraphCollapseState = (
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  options: GraphCollapseOptions = {},
) => {
  const { t } = useI18n()
  const { onSelectionChange, selectedNodeId } = options
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set())
  const collapsedNodeIdsRef = useLatest(collapsedNodeIds)
  const onSelectionChangeRef = useLatest(onSelectionChange)
  const selectedNodeIdRef = useLatest(selectedNodeId)
  const childrenByNode = useMemo(() => buildContainsChildrenMap(edges), [edges])
  const descendantCounts = useMemo(() => buildDescendantCountMap(childrenByNode), [childrenByNode])
  const hiddenNodeIds = useMemo(
    () => getHiddenNodeIds(nodes, collapsedNodeIds, childrenByNode),
    [childrenByNode, collapsedNodeIds, nodes],
  )
  const visible = useMemo(
    () => getVisibleGraphElements(nodes, edges, hiddenNodeIds),
    [edges, hiddenNodeIds, nodes],
  )

  const setCollapsed = useCallback(
    (nodeId: string, collapsed: boolean, includeDescendants = false) => {
      if (!childrenByNode.has(nodeId)) return
      const descendants = includeDescendants
        ? getDescendants([nodeId], childrenByNode)
        : new Set<string>()
      setCollapsedNodeIds((current) => {
        const affected = [nodeId, ...descendants]
        const alreadyApplied = affected.every((id) => current.has(id) === collapsed)
        if (alreadyApplied) return current
        const next = new Set(current)
        affected.forEach((id) => (collapsed ? next.add(id) : next.delete(id)))
        return next
      })
    },
    [childrenByNode],
  )

  const toggleNode = useCallback(
    (nodeId: string) => {
      const collapsing = !collapsedNodeIdsRef.current.has(nodeId)
      const currentSelection = selectedNodeIdRef.current
      if (collapsing && currentSelection) {
        const nextSelection = getSelectionAfterBranchCollapse(
          currentSelection,
          nodeId,
          childrenByNode,
        )
        if (nextSelection !== currentSelection) onSelectionChangeRef.current?.(nextSelection)
      }
      setCollapsed(nodeId, collapsing)
    },
    [childrenByNode, collapsedNodeIdsRef, onSelectionChangeRef, selectedNodeIdRef, setCollapsed],
  )
  const collapseNode = useCallback(
    (nodeId: string, includeDescendants = false) => setCollapsed(nodeId, true, includeDescendants),
    [setCollapsed],
  )
  const expandNode = useCallback(
    (nodeId: string, includeDescendants = false) => setCollapsed(nodeId, false, includeDescendants),
    [setCollapsed],
  )

  const visibleNodes = useMemo(
    () =>
      visible.visibleNodes.map((node) => {
        if (!childrenByNode.has(node.id)) return node
        const descendantCount = descendantCounts.get(node.id) ?? 0
        const collapsed = collapsedNodeIds.has(node.id)
        return {
          ...node,
          data: {
            ...node.data,
            graphBranch: {
              collapsed,
              descendantCount,
              label: collapsed
                ? t('graph.expandDescendants', { count: descendantCount })
                : t('graph.collapseDescendants', { count: descendantCount }),
              title: collapsed ? t('graph.expandBranch') : t('graph.collapseBranch'),
              toggle: toggleNode,
            },
          },
        }
      }),
    [childrenByNode, collapsedNodeIds, descendantCounts, t, toggleNode, visible.visibleNodes],
  )

  return {
    collapsedNodeIds,
    collapseNode,
    expandNode,
    visibleEdges: visible.visibleEdges,
    visibleNodes,
  }
}
