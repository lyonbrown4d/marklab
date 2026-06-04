import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { buildGraphFromRustGraph, type GraphData } from '@/logic/graph'
import { fsApi, type FsWorkspaceIndex } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import type { GraphContentMode } from '@/store/useAppStore'

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [], layoutKey: 'empty' }

export const useGraphData = (
  mode: 'file' | 'workspace' | null,
  workspaceIndex: FsWorkspaceIndex | null,
  activePath: string | null,
  contentMode: GraphContentMode,
) => {
  const desktopAvailable = isDesktopRuntime()
  const enabled = Boolean(mode)
  const hasWorkspaceIndex = Boolean(workspaceIndex)
  const workspaceIndexKey = useMemo(() => {
    if (!workspaceIndex) return ''
    return workspaceIndex.files
      .map((file) => `${file.path}:${file.headings.length}:${file.links.length}`)
      .join('\n')
  }, [workspaceIndex])

  const outlineQuery = useQuery({
    queryKey: ['outline-graph', activePath],
    queryFn: () => fsApi.getOutlineGraph(activePath ?? ''),
    enabled: mode === 'file' && desktopAvailable && Boolean(activePath),
    staleTime: 2_000,
  })

  const workspaceGraphQuery = useQuery({
    queryKey: ['workspace-graph', workspaceIndexKey],
    queryFn: () => fsApi.getWorkspaceGraph(),
    enabled: mode === 'workspace' && desktopAvailable && hasWorkspaceIndex,
    staleTime: 2_000,
  })

  const graph = useMemo(() => {
    if (!enabled) return EMPTY_GRAPH

    const graphContentMode = mode === 'file' ? 'full' : contentMode

    if (mode === 'file') {
      return outlineQuery.data
        ? buildGraphFromRustGraph(outlineQuery.data, graphContentMode)
        : EMPTY_GRAPH
    }

    if (mode === 'workspace' && hasWorkspaceIndex) {
      if (workspaceGraphQuery.data) {
        return buildGraphFromRustGraph(workspaceGraphQuery.data, graphContentMode)
      }
    }

    return EMPTY_GRAPH
  }, [contentMode, enabled, hasWorkspaceIndex, mode, outlineQuery.data, workspaceGraphQuery.data])

  const loading =
    mode === 'file'
      ? outlineQuery.isFetching && !outlineQuery.data
      : mode === 'workspace'
        ? workspaceGraphQuery.isFetching && !workspaceGraphQuery.data
        : false

  return { graph, loading }
}
