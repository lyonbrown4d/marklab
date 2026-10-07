import { useMemo } from 'react'
import { buildFileTree } from '@/logic/fileTree'
import { useGraphData } from '@/app/useGraphData'
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
  const graphState = useGraphData(
    graphWorkspace ? 'workspace' : null,
    workspaceKey,
    graphContentMode,
  )
  return {
    fileTree,
    graph: graphState.graph,
    graphError: graphState.error,
    graphLoading: graphState.loading,
    graphRefreshing: graphState.refreshing,
    graphRetry: graphState.retry,
  }
}
