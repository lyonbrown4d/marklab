import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { Node } from '@xyflow/react'
import type { GraphData, GraphNodeData } from '@/logic/graph'
import {
  hasGraphInteractionSinceLayoutRequest,
  mergeDeferredGraphLayout,
  mergeGraphNodePositions,
} from '@/logic/graphViewState'
import type { GraphContentMode } from '@/store/appTypes'
import { fitViewOptions, type GraphFlowInstance } from '@/pages/graph/graphPageConfig'

type UseGraphAutoLayoutOptions = {
  contentMode: GraphContentMode
  editable: boolean
  flowInstance: GraphFlowInstance
  graph: GraphData
  onUpdateHeadingContent: NonNullable<GraphNodeData['onUpdateContent']>
  onUpdateHeadingTitle: NonNullable<GraphNodeData['onUpdateTitle']>
  setNodes: Dispatch<SetStateAction<Node<GraphNodeData>[]>>
}

export const useGraphAutoLayout = ({
  contentMode,
  editable,
  flowInstance,
  graph,
  onUpdateHeadingContent,
  onUpdateHeadingTitle,
  setNodes,
}: UseGraphAutoLayoutOptions) => {
  const requestedLayoutKeyRef = useRef<string | undefined>(undefined)
  const appliedLayoutKeyRef = useRef<string | undefined>(undefined)
  const layoutRunRef = useRef(0)

  useEffect(() => {
    const preservePositions = requestedLayoutKeyRef.current === graph.layoutKey
    const nextNodes = graph.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        contentMode,
        editable: editable && node.type === 'heading',
        onUpdateTitle: onUpdateHeadingTitle,
        onUpdateContent: onUpdateHeadingContent,
      },
    }))
    setNodes((currentNodes) => mergeGraphNodePositions(nextNodes, currentNodes, preservePositions))
    requestedLayoutKeyRef.current = graph.layoutKey

    if (preservePositions && appliedLayoutKeyRef.current === graph.layoutKey) return undefined

    const layoutRun = layoutRunRef.current + 1
    layoutRunRef.current = layoutRun
    let cancelled = false
    const requestedViewport = flowInstance?.getViewport()

    void import('@/logic/graphLayout')
      .then(({ layoutGraphWithElk }) => layoutGraphWithElk(nextNodes, graph.edges))
      .then((layoutNodes) => {
        if (cancelled || layoutRunRef.current !== layoutRun) return
        appliedLayoutKeyRef.current = graph.layoutKey
        let graphInteractionChanged = hasGraphInteractionSinceLayoutRequest(
          flowInstance?.getNodes() ?? [],
          nextNodes,
        )
        setNodes((currentNodes) => {
          graphInteractionChanged ||= hasGraphInteractionSinceLayoutRequest(currentNodes, nextNodes)
          return mergeDeferredGraphLayout(layoutNodes, currentNodes, nextNodes)
        })
        window.requestAnimationFrame(() => {
          const currentViewport = flowInstance?.getViewport()
          const viewportChanged =
            Boolean(requestedViewport && currentViewport) &&
            (requestedViewport?.x !== currentViewport?.x ||
              requestedViewport?.y !== currentViewport?.y ||
              requestedViewport?.zoom !== currentViewport?.zoom)
          if (
            !cancelled &&
            layoutRunRef.current === layoutRun &&
            !graphInteractionChanged &&
            !viewportChanged
          ) {
            flowInstance?.fitView(fitViewOptions)
          }
        })
      })
      .catch((error: unknown) => {
        console.warn('Failed to apply ELK graph layout', error)
      })

    return () => {
      cancelled = true
    }
  }, [
    contentMode,
    editable,
    flowInstance,
    graph.edges,
    graph.layoutKey,
    graph.nodes,
    onUpdateHeadingContent,
    onUpdateHeadingTitle,
    setNodes,
  ])
}
