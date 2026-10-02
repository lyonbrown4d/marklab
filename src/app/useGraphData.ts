import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { buildGraphFromKnowledgeGraph, type GraphData } from '@/logic/graph'
import { appendPreviewNodesFromWorkspaceIndex } from '@/logic/graphPreviewNodes'
import { createWorkspaceGraphRevision } from '@/logic/workspaceGraphRevision'
import { fsApi, type FsGraph, type FsWorkspaceIndex } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import type { GraphContentMode } from '@/store/appTypes'

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [], layoutKey: 'empty' }

export const useGraphData = (
  mode: 'file' | 'workspace' | null,
  workspaceKey: string,
  workspaceIndex: FsWorkspaceIndex | null,
  activePath: string | null,
  contentMode: GraphContentMode,
) => {
  const desktopAvailable = isDesktopRuntime()
  const enabled = Boolean(mode)
  const hasWorkspaceIndex = Boolean(workspaceIndex)
  const workspaceRevision = useMemo(
    () => (workspaceIndex ? createWorkspaceGraphRevision(workspaceIndex) : ''),
    [workspaceIndex],
  )

  const outlineQuery = useQuery<FsGraph>({
    queryKey: ['outline-graph', workspaceKey, activePath],
    queryFn: () => fsApi.getOutlineGraph(activePath ?? ''),
    enabled: mode === 'file' && desktopAvailable && Boolean(activePath),
    staleTime: 2_000,
  })

  const workspaceGraphQuery = useQuery<FsGraph>({
    queryKey: ['workspace-graph', workspaceKey, workspaceRevision],
    queryFn: () => fsApi.getWorkspaceGraph(),
    enabled: mode === 'workspace' && desktopAvailable && hasWorkspaceIndex,
    staleTime: 2_000,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === workspaceKey ? previousData : undefined,
  })
  const { refetch: refetchOutline } = outlineQuery
  const { refetch: refetchWorkspaceGraph } = workspaceGraphQuery

  const graph = useMemo(() => {
    if (!enabled) return EMPTY_GRAPH

    const graphContentMode = mode === 'file' ? 'full' : contentMode

    if (mode === 'file') {
      return outlineQuery.data
        ? appendPreviewNodesFromWorkspaceIndex(
            buildGraphFromKnowledgeGraph(outlineQuery.data, graphContentMode),
            workspaceIndex,
            activePath,
          )
        : EMPTY_GRAPH
    }

    if (mode === 'workspace' && hasWorkspaceIndex) {
      if (workspaceGraphQuery.data) {
        return appendPreviewNodesFromWorkspaceIndex(
          buildGraphFromKnowledgeGraph(workspaceGraphQuery.data, graphContentMode),
          workspaceIndex,
        )
      }
    }

    return EMPTY_GRAPH
  }, [
    activePath,
    contentMode,
    enabled,
    hasWorkspaceIndex,
    mode,
    outlineQuery.data,
    workspaceGraphQuery.data,
    workspaceIndex,
  ])

  const loading =
    mode === 'file'
      ? outlineQuery.isFetching && !outlineQuery.data
      : mode === 'workspace'
        ? workspaceGraphQuery.isFetching && !workspaceGraphQuery.data
        : false

  const refreshing =
    mode === 'file'
      ? outlineQuery.isFetching && Boolean(outlineQuery.data)
      : mode === 'workspace'
        ? workspaceGraphQuery.isFetching && Boolean(workspaceGraphQuery.data)
        : false
  const error =
    mode === 'file'
      ? (outlineQuery.error ?? null)
      : mode === 'workspace'
        ? (workspaceGraphQuery.error ?? null)
        : null
  const retry = useCallback(() => {
    if (mode === 'file') return refetchOutline()
    if (mode === 'workspace') return refetchWorkspaceGraph()
    return Promise.resolve()
  }, [mode, refetchOutline, refetchWorkspaceGraph])

  return { graph, loading, error, retry, refreshing }
}
