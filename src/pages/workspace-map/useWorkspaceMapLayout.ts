import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useLatest } from 'ahooks'
import type { Node, ReactFlowInstance } from '@xyflow/react'
import type { GraphData, GraphNodeData } from '@/logic/graph'
import { createGraphLayoutKey } from '@/logic/graphLayoutKey'
import {
  WORKSPACE_MAP_COMPACT_NODE_HEIGHT,
  WORKSPACE_MAP_COMPACT_NODE_WIDTH,
} from '@/logic/graphLayoutMetrics'
import { mergeWorkspaceMapNodeGeometry } from '@/pages/workspace-map/workspaceMapNodePresentation'
import type { WorkspaceMapMode } from '@/pages/workspace-map/workspaceMapMode'

type WorkspaceMapFlow = Pick<
  ReactFlowInstance<Node<GraphNodeData>, GraphData['edges'][number]>,
  'fitView'
> | null

type Options = {
  activePath: string | null
  flow: WorkspaceMapFlow
  focusPath?: string | null
  graph: GraphData
  mode?: WorkspaceMapMode
  nodes?: Node<GraphNodeData>[]
  setNodes: Dispatch<SetStateAction<Node<GraphNodeData>[]>>
}

type LayoutState = {
  key: string | undefined
  status: 'error' | 'loading' | 'ready'
}

const mergeForcedLayoutGeometry = (
  incoming: Node<GraphNodeData>,
  current: Node<GraphNodeData> | undefined,
) => {
  if (!current) return incoming
  const merged = mergeWorkspaceMapNodeGeometry(incoming, current)
  return {
    ...merged,
    position: current.data.workspaceMapPinned ? current.position : incoming.position,
  }
}

const mergeRuntimeLayoutGeometry = (
  incomingNodes: Node<GraphNodeData>[],
  currentNodes: Node<GraphNodeData>[],
) => {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]))
  return incomingNodes.map((node) => {
    const current = currentById.get(node.id)
    const width = current?.width ?? current?.measured?.width
    const height = current?.height ?? current?.measured?.height
    const currentCompact =
      width === WORKSPACE_MAP_COMPACT_NODE_WIDTH && height === WORKSPACE_MAP_COMPACT_NODE_HEIGHT
    const incomingCompact =
      node.width === WORKSPACE_MAP_COMPACT_NODE_WIDTH &&
      node.height === WORKSPACE_MAP_COMPACT_NODE_HEIGHT
    if (!current || !width || !height || currentCompact || incomingCompact) return node
    return mergeWorkspaceMapNodeGeometry(node, current)
  })
}

export const createWorkspaceMapRuntimeLayoutKey = (
  requestKey: string,
  nodes: Node<GraphNodeData>[],
) => `${requestKey}:${createGraphLayoutKey('runtime', nodes, [])}`

export const useWorkspaceMapLayout = ({
  activePath,
  flow,
  focusPath = activePath,
  graph,
  mode = 'focus',
  nodes = graph.nodes,
  setNodes,
}: Options) => {
  const runRef = useRef(0)
  const hasCompletedLayoutRef = useRef(false)
  const fittedFlowRef = useRef<WorkspaceMapFlow>(null)
  const staleFlowRef = useRef<WorkspaceMapFlow>(null)
  const previousStatusRef = useRef<LayoutState['status']>('loading')
  const laidOutNodesRef = useRef<Node<GraphNodeData>[]>([])
  const graphRef = useLatest(graph)
  const nodesRef = useLatest(nodes)
  const [retryGeneration, setRetryGeneration] = useState(0)
  const [arrangeGeneration, setArrangeGeneration] = useState(0)
  const previousActivePathRef = useRef(activePath)
  const previousModeRef = useRef(mode)
  const previousArrangeGenerationRef = useRef(arrangeGeneration)
  const [layoutState, setLayoutState] = useState<LayoutState>({ key: undefined, status: 'loading' })
  const retry = useCallback(() => setRetryGeneration((generation) => generation + 1), [])
  const arrange = useCallback(() => setArrangeGeneration((generation) => generation + 1), [])
  const baseLayoutKey = graph.layoutKey ?? 'workspace-map'
  const arrangementKey =
    mode === 'focus' && arrangeGeneration === 0
      ? baseLayoutKey
      : `${baseLayoutKey}:${mode}:${arrangeGeneration}`
  const requestKey = activePath ? `${arrangementKey}:active:${activePath}` : arrangementKey
  const stateKey = `${requestKey}:retry:${retryGeneration}`

  useEffect(() => {
    const run = runRef.current + 1
    runRef.current = run
    let cancelled = false
    const layoutGraph = graphRef.current
    const layoutNodes = mergeRuntimeLayoutGeometry(layoutGraph.nodes, nodesRef.current)
    const layoutKey = createWorkspaceMapRuntimeLayoutKey(requestKey, layoutNodes)
    const layoutStateKey = stateKey
    const forcePositions =
      previousActivePathRef.current !== activePath ||
      previousModeRef.current !== mode ||
      previousArrangeGenerationRef.current !== arrangeGeneration
    previousActivePathRef.current = activePath
    previousModeRef.current = mode
    previousArrangeGenerationRef.current = arrangeGeneration
    const controller = new AbortController()

    void import('@/logic/graphLayout')
      .then(({ layoutGraphWithElk }) =>
        layoutGraphWithElk(layoutNodes, layoutGraph.edges, {
          layoutKey,
          signal: controller.signal,
        }),
      )
      .then((nodes) => {
        if (cancelled || runRef.current !== run) return
        if (hasCompletedLayoutRef.current && !forcePositions) {
          setNodes((current) => {
            const currentById = new Map(current.map((node) => [node.id, node]))
            const mergedNodes = nodes.map((node) => {
              const existing = currentById.get(node.id)
              return existing ? mergeWorkspaceMapNodeGeometry(node, existing) : node
            })
            laidOutNodesRef.current = mergedNodes
            return mergedNodes
          })
        } else {
          const preserveInteractionState = hasCompletedLayoutRef.current
          hasCompletedLayoutRef.current = true
          if (preserveInteractionState) {
            setNodes((current) => {
              const currentById = new Map(current.map((node) => [node.id, node]))
              const mergedNodes = nodes.map((node) =>
                mergeForcedLayoutGeometry(node, currentById.get(node.id)),
              )
              laidOutNodesRef.current = mergedNodes
              return mergedNodes
            })
          } else {
            laidOutNodesRef.current = nodes
            setNodes(nodes)
          }
        }
        setLayoutState({ key: layoutStateKey, status: 'ready' })
      })
      .catch((error: unknown) => {
        if (cancelled || runRef.current !== run) return
        console.warn('Workspace map layout failed.', error)
        setLayoutState({ key: layoutStateKey, status: 'error' })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [
    arrangeGeneration,
    activePath,
    graph.layoutKey,
    graphRef,
    mode,
    nodesRef,
    requestKey,
    retryGeneration,
    setNodes,
    stateKey,
  ])

  const status = layoutState.key === stateKey ? layoutState.status : 'loading'

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
      const activeNode = focusPath ? nodes.find((node) => node.data.path === focusPath) : undefined
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
  }, [flow, focusPath, status])

  return { arrange, retry, status }
}
