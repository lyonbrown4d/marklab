import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { buildGraphFromKnowledgeGraph, type GraphData } from '@/logic/graph'
import { fsApi, type FsGraph } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import type { GraphContentMode } from '@/store/appTypes'

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [], layoutKey: 'empty' }

export const useGraphData = (
  mode: 'workspace' | null,
  workspaceKey: string,
  contentMode: GraphContentMode,
) => {
  const desktopAvailable = isDesktopRuntime()
  const enabled = Boolean(mode)

  const workspaceGraphQuery = useQuery<FsGraph>({
    queryKey: ['workspace-graph', workspaceKey],
    queryFn: () => fsApi.getWorkspaceGraph(),
    enabled: mode === 'workspace' && desktopAvailable,
    staleTime: 2_000,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === workspaceKey ? previousData : undefined,
  })
  const { refetch: refetchWorkspaceGraph } = workspaceGraphQuery

  const graph = useMemo(() => {
    if (!enabled) return EMPTY_GRAPH

    if (mode === 'workspace' && workspaceGraphQuery.data) {
      return buildGraphFromKnowledgeGraph(workspaceGraphQuery.data, contentMode)
    }

    return EMPTY_GRAPH
  }, [contentMode, enabled, mode, workspaceGraphQuery.data])

  const loading =
    mode === 'workspace' && workspaceGraphQuery.isFetching && !workspaceGraphQuery.data
  const refreshing =
    mode === 'workspace' && workspaceGraphQuery.isFetching && Boolean(workspaceGraphQuery.data)
  const error = mode === 'workspace' ? (workspaceGraphQuery.error ?? null) : null
  const retry = useCallback(() => {
    if (mode === 'workspace') return refetchWorkspaceGraph()
    return Promise.resolve()
  }, [mode, refetchWorkspaceGraph])

  return { graph, loading, error, retry, refreshing }
}
