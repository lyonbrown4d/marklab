import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { useLatest } from 'ahooks'
import type { Node, ReactFlowInstance } from '@xyflow/react'
import type { GraphData, GraphNodeData } from '@/logic/graph'

type WorkspaceMapFlow = ReactFlowInstance<Node<GraphNodeData>, GraphData['edges'][number]> | null

type Options = {
  activePath: string | null
  flow: WorkspaceMapFlow
  graph: GraphData
  setNodes: Dispatch<SetStateAction<Node<GraphNodeData>[]>>
}

export const useWorkspaceMapLayout = ({ activePath, flow, graph, setNodes }: Options) => {
  const runRef = useRef(0)
  const initialFitRef = useRef(false)
  const graphRef = useLatest(graph)

  useEffect(() => {
    const run = runRef.current + 1
    runRef.current = run
    let cancelled = false
    const layoutGraph = graphRef.current
    setNodes(layoutGraph.nodes)

    void import('@/logic/graphLayout')
      .then(({ layoutGraphWithElk }) => layoutGraphWithElk(layoutGraph.nodes, layoutGraph.edges))
      .then((nodes) => {
        if (cancelled || runRef.current !== run) return
        setNodes(nodes)
        window.requestAnimationFrame(() => {
          if (cancelled || runRef.current !== run || !flow) return
          const activeNode = activePath
            ? nodes.find((node) => node.data.path === activePath)
            : undefined
          if (activeNode) {
            void flow.fitView({ nodes: [activeNode], padding: 0.14, maxZoom: 1, duration: 0 })
          } else if (!initialFitRef.current) {
            initialFitRef.current = true
            void flow.fitView({ padding: 0.22, duration: 0 })
          }
        })
      })
      .catch((error: unknown) => console.warn('Failed to layout workspace map', error))

    return () => {
      cancelled = true
    }
  }, [activePath, flow, graph.layoutKey, graphRef, setNodes])
}
