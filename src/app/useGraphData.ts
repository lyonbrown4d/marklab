import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fsApi, type FsGraph } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { workspaceGraphQueryKey, workspaceGraphRequest } from '@/logic/knowledgeGraphRequest'

const EMPTY_GRAPH: FsGraph = {
  mode: 'relations',
  revision: '',
  topology_key: 'empty',
  nodes: [],
  edges: [],
  truncated: false,
  total_nodes: 0,
  total_edges: 0,
}

export const useGraphData = (mode: 'workspace' | null, workspaceKey: string) => {
  const includeAttachments = usePreferencesStore((state) => state.graphShowAttachments)
  const includeMissing = usePreferencesStore((state) => state.graphShowMissing)
  const request = workspaceGraphRequest(includeAttachments, includeMissing)
  const query = useQuery({
    queryKey: workspaceGraphQueryKey(workspaceKey, request),
    queryFn: () => fsApi.getWorkspaceGraph(request),
    enabled: mode === 'workspace' && isDesktopRuntime(),
    staleTime: 2_000,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === workspaceKey ? previous : undefined,
  })
  const { refetch } = query
  const retry = useCallback(() => {
    if (mode === 'workspace') return refetch()
    return Promise.resolve()
  }, [mode, refetch])

  return {
    graph: mode ? (query.data ?? EMPTY_GRAPH) : EMPTY_GRAPH,
    loading: mode === 'workspace' && query.isFetching && !query.data,
    refreshing: mode === 'workspace' && query.isFetching && Boolean(query.data),
    error: mode === 'workspace' ? (query.error ?? null) : null,
    retry,
  }
}
