import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { buildGraphFromKnowledgeGraph, type GraphData } from '@/logic/graph'
import { appendPreviewNodesFromWorkspaceIndex } from '@/logic/graphPreviewNodes'
import { createWorkspaceGraphStructureRevision } from '@/logic/workspaceGraphRevision'
import { fsApi, type FsGraph, type FsWorkspaceIndex } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import type { GraphContentMode } from '@/store/appTypes'

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [], layoutKey: 'empty' }

export const useGraphData = (
  mode: 'workspace' | null,
  workspaceKey: string,
  workspaceIndex: FsWorkspaceIndex | null,
  contentMode: GraphContentMode,
) => {
  const queryClient = useQueryClient()
  const desktopAvailable = isDesktopRuntime()
  const enabled = Boolean(mode)
  const workspaceStructureRevision = useMemo(
    () => (workspaceIndex ? createWorkspaceGraphStructureRevision(workspaceIndex) : ''),
    [workspaceIndex],
  )
  const previousStructureRef = useRef({ revision: '', workspaceKey })

  const workspaceGraphQuery = useQuery<FsGraph>({
    queryKey: ['workspace-graph', workspaceKey],
    queryFn: () => fsApi.getWorkspaceGraph(),
    enabled: mode === 'workspace' && desktopAvailable,
    staleTime: 2_000,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === workspaceKey ? previousData : undefined,
  })
  const { refetch: refetchWorkspaceGraph } = workspaceGraphQuery

  useEffect(() => {
    const previous = previousStructureRef.current
    previousStructureRef.current = { revision: workspaceStructureRevision, workspaceKey }
    if (
      mode !== 'workspace' ||
      !workspaceStructureRevision ||
      previous.workspaceKey !== workspaceKey ||
      !previous.revision ||
      previous.revision === workspaceStructureRevision
    )
      return
    void queryClient.invalidateQueries({ queryKey: ['workspace-graph', workspaceKey] })
  }, [mode, queryClient, workspaceKey, workspaceStructureRevision])

  const graph = useMemo(() => {
    if (!enabled) return EMPTY_GRAPH

    if (mode === 'workspace' && workspaceGraphQuery.data) {
      return appendPreviewNodesFromWorkspaceIndex(
        buildGraphFromKnowledgeGraph(workspaceGraphQuery.data, contentMode),
        workspaceIndex,
      )
    }

    return EMPTY_GRAPH
  }, [contentMode, enabled, mode, workspaceGraphQuery.data, workspaceIndex])

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
