import { useMemo } from 'react'
import { buildFileTree } from '@/logic/fileTree'
import { useGraphData } from '@/app/useGraphData'
import { useWorkspaceIndex } from '@/app/useWorkspaceIndex'
import { combineGraphAsyncState } from '@/app/combineGraphAsyncState'
import type { FileEntry, GraphContentMode } from '@/store/appTypes'

type Options = {
  currentFilePath: string | null
  entries: FileEntry[]
  graphContentMode: GraphContentMode
  graphFile: boolean
  graphWorkspace: boolean
  workspaceKey: string
}

export const useAppLayoutGraphState = ({
  currentFilePath,
  entries,
  graphContentMode,
  graphFile,
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
    graphWorkspace ? 'workspace' : graphFile ? 'file' : null,
    workspaceKey,
    indexState.data,
    currentFilePath,
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
  }
}
