import { useMemo } from 'react'
import { buildFileTree } from '@/logic/fileTree'
import { useGraphData } from '@/app/useGraphData'
import type { FileEntry } from '@/store/appTypes'
import { useWorkbenchState } from '@/features/workbench/workbenchState'

type Options = {
  entries: FileEntry[]
  graphWorkspace: boolean
  workspaceKey: string
}

export const useAppLayoutGraphState = ({ entries, graphWorkspace, workspaceKey }: Options) => {
  const fileTree = useMemo(() => buildFileTree(entries), [entries])
  const graphVisible = useWorkbenchState(
    (state) => state.workspaces[workspaceKey]?.graphVisible ?? false,
  )
  const graphState = useGraphData(graphWorkspace || graphVisible ? 'workspace' : null, workspaceKey)
  return {
    fileTree,
    graph: graphState.graph,
    graphError: graphState.error,
    graphLoading: graphState.loading,
    graphRefreshing: graphState.refreshing,
    graphRetry: graphState.retry,
  }
}
