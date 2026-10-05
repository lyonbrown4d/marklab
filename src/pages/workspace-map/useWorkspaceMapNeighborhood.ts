import { useCallback, useMemo, useState, type FocusEvent, type MouseEvent } from 'react'
import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import {
  createWorkspaceMapNeighborhood,
  presentWorkspaceMapNeighborhoodEdges,
} from '@/pages/workspace-map/workspaceMapNeighborhood'

type Options = {
  activePath: string | null
  baseEdges: Edge[]
  edges: Edge[]
  nodes: Node<GraphNodeData>[]
}

export const useWorkspaceMapNeighborhood = ({ activePath, baseEdges, edges, nodes }: Options) => {
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const activeNodeId = useMemo(
    () =>
      nodes.find((node) => node.data.path === activePath || node.data.webView?.active)?.id ?? null,
    [activePath, nodes],
  )
  const engagedNodeId = hoveredNodeId ?? focusedNodeId ?? activeNodeId
  const neighborhood = useMemo(
    () => createWorkspaceMapNeighborhood(baseEdges, engagedNodeId),
    [baseEdges, engagedNodeId],
  )
  const presentedEdges = useMemo(
    () => presentWorkspaceMapNeighborhoodEdges(edges, neighborhood),
    [edges, neighborhood],
  )
  const onNodeMouseEnter = useCallback((_event: MouseEvent, node: Node<GraphNodeData>) => {
    setHoveredNodeId(node.id)
  }, [])
  const onNodeMouseLeave = useCallback((_event: MouseEvent, node: Node<GraphNodeData>) => {
    setHoveredNodeId((current) => (current === node.id ? null : current))
  }, [])
  const onFocusCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    setFocusedNodeId(target?.closest<HTMLElement>('.react-flow__node')?.dataset.id ?? null)
  }, [])
  const onBlurCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null
    setFocusedNodeId(
      nextTarget && event.currentTarget.contains(nextTarget)
        ? (nextTarget.closest<HTMLElement>('.react-flow__node')?.dataset.id ?? null)
        : null,
    )
  }, [])
  const clear = useCallback(() => {
    setFocusedNodeId(null)
    setHoveredNodeId(null)
  }, [])

  return {
    clear,
    focusNode: setFocusedNodeId,
    neighborhood,
    onBlurCapture,
    onFocusCapture,
    onNodeMouseEnter,
    onNodeMouseLeave,
    presentedEdges,
  }
}
