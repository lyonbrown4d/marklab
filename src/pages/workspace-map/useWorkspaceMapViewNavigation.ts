import { useCallback, useEffect, useRef } from 'react'
import type { Edge, Node, ReactFlowInstance, Viewport } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { navigationHistoryStore } from '@/features/navigation/navigationHistory'

type WorkspaceMapNavigationFlow = Pick<
  ReactFlowInstance<Node<GraphNodeData>, Edge>,
  'fitView' | 'getViewport' | 'setViewport'
>

type WorkspaceMapViewNavigationOptions = {
  active?: boolean
  clearNeighborhood: () => void
  flow: WorkspaceMapNavigationFlow | null
  focusNeighborhoodNode: (nodeId: string) => void
  graphIdentity: string
  reducedMotion?: boolean
}

const systemPrefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const useWorkspaceMapViewNavigation = ({
  active = true,
  clearNeighborhood,
  flow,
  focusNeighborhoodNode,
  graphIdentity,
  reducedMotion = systemPrefersReducedMotion(),
}: WorkspaceMapViewNavigationOptions) => {
  const focusedRef = useRef(false)
  const previousViewportRef = useRef<Viewport | null>(null)
  const navigationSequenceRef = useRef(0)

  useEffect(() => {
    focusedRef.current = false
    previousViewportRef.current = null
    navigationSequenceRef.current += 1
    return () => {
      navigationSequenceRef.current += 1
    }
  }, [active, graphIdentity])

  const recordViewportAfter = useCallback(
    (navigation: Promise<boolean>, nodeId: string) => {
      const sequence = ++navigationSequenceRef.current
      void navigation
        .then((completed) => {
          if (!active || !completed || sequence !== navigationSequenceRef.current || !flow) return
          navigationHistoryStore.getState().visit({
            kind: 'graph',
            nodeId,
            viewport: flow.getViewport(),
          })
        })
        .catch(() => undefined)
    },
    [active, flow],
  )

  const focusNode = useCallback(
    (node: Node<GraphNodeData>) => {
      if (!flow) return
      if (!focusedRef.current) previousViewportRef.current = flow.getViewport()
      focusedRef.current = true
      focusNeighborhoodNode(node.id)
      recordViewportAfter(
        flow.fitView({
          duration: reducedMotion ? 0 : 180,
          maxZoom: 1,
          minZoom: 0.35,
          nodes: [node],
          padding: 0.32,
        }),
        node.data.path ?? node.id,
      )
    },
    [flow, focusNeighborhoodNode, recordViewportAfter, reducedMotion],
  )

  const exitFocus = useCallback(() => {
    if (!focusedRef.current) return false
    const previousViewport = previousViewportRef.current
    focusedRef.current = false
    previousViewportRef.current = null
    clearNeighborhood()
    if (flow && previousViewport) {
      recordViewportAfter(
        flow.setViewport(previousViewport, { duration: reducedMotion ? 0 : 180 }),
        'workspace',
      )
    }
    return true
  }, [clearNeighborhood, flow, recordViewportAfter, reducedMotion])

  const fitWorkspace = useCallback(() => {
    if (!flow) return
    recordViewportAfter(
      flow.fitView({
        duration: reducedMotion ? 0 : 180,
        maxZoom: 1,
        minZoom: 0.35,
        padding: 0.22,
      }),
      'workspace',
    )
  }, [flow, recordViewportAfter, reducedMotion])

  return { exitFocus, fitWorkspace, focusNode }
}
