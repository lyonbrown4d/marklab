import { useCallback, useMemo, useState, type MouseEvent, type RefObject } from 'react'
import type { Edge, Node } from '@xyflow/react'

import type { GraphNodeData } from '@/logic/graph'
import { buildGraphNodeDetails } from '@/logic/graphViewModel'

type UseGraphHoverPreviewArgs = {
  edges: Edge[]
  nodes: Node<GraphNodeData>[]
  shellRef: RefObject<HTMLDivElement | null>
}

export const useGraphHoverPreview = ({ edges, nodes, shellRef }: UseGraphHoverPreviewArgs) => {
  const [hoverPreview, setHoverPreview] = useState<{
    nodeId: string
    x: number
    y: number
  } | null>(null)

  const updateHoverPreview = useCallback(
    (event: MouseEvent, node: Node<GraphNodeData>) => {
      const bounds = shellRef.current?.getBoundingClientRect()
      if (!bounds) return
      const next = {
        nodeId: node.id,
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      }
      setHoverPreview((current) =>
        current &&
        current.nodeId === next.nodeId &&
        Math.abs(current.x - next.x) < 8 &&
        Math.abs(current.y - next.y) < 8
          ? current
          : next,
      )
    },
    [shellRef],
  )

  const clearHoverPreview = useCallback(() => {
    setHoverPreview(null)
  }, [])

  const hoverNodeDetails = useMemo(
    () => buildGraphNodeDetails(nodes, edges, hoverPreview?.nodeId ?? null),
    [edges, hoverPreview?.nodeId, nodes],
  )

  return {
    clearHoverPreview,
    hoverNodeDetails,
    hoverPreview,
    updateHoverPreview,
  }
}
