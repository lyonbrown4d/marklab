import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useLatest } from 'ahooks'
import type { Node, ReactFlowInstance } from '@xyflow/react'
import type { GraphData, GraphNodeData } from '@/logic/graph'

type WorkspaceMapFlow = Pick<
  ReactFlowInstance<Node<GraphNodeData>, GraphData['edges'][number]>,
  'fitView'
> | null

type Options = {
  activePath: string | null
  flow: WorkspaceMapFlow
  graph: GraphData
  setNodes: Dispatch<SetStateAction<Node<GraphNodeData>[]>>
}

type LayoutState = {
  key: string | undefined
  status: 'error' | 'loading' | 'ready'
}

export const useWorkspaceMapLayout = ({ activePath, flow, graph, setNodes }: Options) => {
  const runRef = useRef(0)
  const fittedFlowRef = useRef<WorkspaceMapFlow>(null)
  const staleFlowRef = useRef<WorkspaceMapFlow>(null)
  const previousStatusRef = useRef<LayoutState['status']>('loading')
  const laidOutNodesRef = useRef<Node<GraphNodeData>[]>([])
  const graphRef = useLatest(graph)
  const [retryGeneration, setRetryGeneration] = useState(0)
  const [layoutState, setLayoutState] = useState<LayoutState>({ key: undefined, status: 'loading' })
  const retry = useCallback(() => setRetryGeneration((generation) => generation + 1), [])

  useEffect(() => {
    const run = runRef.current + 1
    runRef.current = run
    let cancelled = false
    const layoutGraph = graphRef.current
    const layoutKey = layoutGraph.layoutKey
    setLayoutState({ key: layoutKey, status: 'loading' })

    void import('@/logic/graphLayout')
      .then(({ layoutGraphWithElk }) => layoutGraphWithElk(layoutGraph.nodes, layoutGraph.edges))
      .then((nodes) => {
        if (cancelled || runRef.current !== run) return
        laidOutNodesRef.current = nodes
        setNodes(nodes)
        setLayoutState({ key: layoutKey, status: 'ready' })
      })
      .catch((error: unknown) => {
        if (cancelled || runRef.current !== run) return
        console.warn('Workspace map layout failed.', error)
        setLayoutState({ key: layoutKey, status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [graph.layoutKey, graphRef, retryGeneration, setNodes])

  const status = layoutState.key === graph.layoutKey ? layoutState.status : 'loading'

  useEffect(() => {
    if (previousStatusRef.current === 'ready' && status !== 'ready' && flow) {
      staleFlowRef.current = flow
    }
    previousStatusRef.current = status
  }, [flow, status])
  useEffect(() => {
    if (!flow || status !== 'ready' || flow === staleFlowRef.current) return
    let cancelled = false
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return
      const nodes = laidOutNodesRef.current
      const activeNode = activePath
        ? nodes.find((node) => node.data.path === activePath)
        : undefined
      if (activeNode) {
        void flow.fitView({ nodes: [activeNode], padding: 0.14, maxZoom: 1, duration: 0 })
      } else if (fittedFlowRef.current !== flow) {
        fittedFlowRef.current = flow
        void flow.fitView({ padding: 0.22, duration: 0 })
      }
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [activePath, flow, status])

  return { retry, status }
}
