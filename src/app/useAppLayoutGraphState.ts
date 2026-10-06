import { useMemo } from 'react'
import { buildFileTree } from '@/logic/fileTree'
import { useGraphData } from '@/app/useGraphData'
import { useWorkspaceIndex } from '@/app/useWorkspaceIndex'
import { combineGraphAsyncState } from '@/app/combineGraphAsyncState'
import type { FileEntry, GraphContentMode } from '@/store/appTypes'

type Options = {
  entries: FileEntry[]
  graphContentMode: GraphContentMode
  graphWorkspace: boolean
  workspaceKey: string
}

export const useAppLayoutGraphState = ({
  entries,
  graphContentMode,
  graphWorkspace,
  workspaceKey,
}: Options) => {
  const fileTree = useMemo(() => buildFileTree(entries), [entries])
  const indexState = useWorkspaceIndex(
    workspaceKey,
    entries,
    entries.some((entry) => entry.kind === 'file'),
  )
  const graphState = useGraphData(
    graphWorkspace ? 'workspace' : null,
    workspaceKey,
    indexState.data,
    graphContentMode,
  )
  const asyncState = combineGraphAsyncState(graphWorkspace, indexState, graphState)
  return {
    fileTree,
    graph: graphState.graph,
    graphError: asyncState.error,
    graphLoading: asyncState.loading,
    graphRefreshing: asyncState.refreshing,
    graphRetry: asyncState.retry,
    workspaceIndex: indexState.data,
    workspaceIndexLoading: indexState.loading,
    workspaceIndexError: indexState.error,
    onRetryWorkspaceIndex: indexState.retry,
  }
}
