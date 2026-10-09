import { useEffect } from 'react'
import { useStore } from 'zustand'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import {
  clearWorkspaceMapNodeFocusRequest,
  workspaceMapNavigationStore,
} from '@/utils/workspaceMapNavigation'

type WorkspaceMapNavigationRequestOptions = {
  active?: boolean
  flow: Pick<ReactFlowInstance<Node<GraphNodeData>, Edge>, 'setViewport'> | null
  fitWorkspace: () => void
  focusNeighborhoodNode: (nodeId: string) => void
  focusNode: (node: Node<GraphNodeData>) => void
  nodes: Node<GraphNodeData>[]
  reducedMotion?: boolean
  workspaceKey: string
}

const systemPrefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const useWorkspaceMapNavigationRequests = ({
  active = true,
  flow,
  fitWorkspace,
  focusNeighborhoodNode,
  focusNode,
  nodes,
  reducedMotion = systemPrefersReducedMotion(),
  workspaceKey,
}: WorkspaceMapNavigationRequestOptions) => {
  const request = useStore(workspaceMapNavigationStore, (state) => state.request)

  useEffect(() => {
    if (!active || !request || request.workspaceKey !== workspaceKey || !flow) return
    if (request.nodeId === 'workspace') {
      if (request.viewport) {
        void flow.setViewport(request.viewport, { duration: reducedMotion ? 0 : 180 })
      } else {
        fitWorkspace()
      }
      clearWorkspaceMapNodeFocusRequest(request)
      return
    }
    const node = nodes.find(
      (candidate) => candidate.id === request.nodeId || candidate.data.path === request.nodeId,
    )
    if (!node) return
    if (request.viewport) {
      focusNeighborhoodNode(node.id)
      void flow.setViewport(request.viewport, { duration: reducedMotion ? 0 : 180 })
    } else {
      focusNode(node)
    }
    clearWorkspaceMapNodeFocusRequest(request)
  }, [
    active,
    fitWorkspace,
    flow,
    focusNeighborhoodNode,
    focusNode,
    nodes,
    reducedMotion,
    request,
    workspaceKey,
  ])
}
