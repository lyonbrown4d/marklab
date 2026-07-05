import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { Node } from '@xyflow/react'
import type { GraphData, GraphNodeData } from '@/logic/graph'
import { layoutGraphWithElk } from '@/logic/graphLayout'
import { mergeGraphNodePositions } from '@/logic/graphViewState'
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
  const layoutKeyRef = useRef<string | undefined>(undefined)
  const layoutRunRef = useRef(0)

  useEffect(() => {
    const preservePositions = layoutKeyRef.current === graph.layoutKey
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
    layoutKeyRef.current = graph.layoutKey

    if (preservePositions) return undefined

    const layoutRun = layoutRunRef.current + 1
    layoutRunRef.current = layoutRun
    let cancelled = false

    void layoutGraphWithElk(nextNodes, graph.edges)
      .then((layoutNodes) => {
        if (cancelled || layoutRunRef.current !== layoutRun) return
        setNodes((currentNodes) => mergeGraphLayoutMetadata(layoutNodes, currentNodes))
        window.requestAnimationFrame(() => {
          if (!cancelled && layoutRunRef.current === layoutRun) {
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

const mergeGraphLayoutMetadata = (
  layoutNodes: Node<GraphNodeData>[],
  currentNodes: Node<GraphNodeData>[],
) => {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]))
  return layoutNodes.map((node) => {
    const current = currentById.get(node.id)
    return current ? { ...node, selected: current.selected, dragging: current.dragging } : node
  })
}
