import type { QueryClient } from '@tanstack/react-query'

import { fsApi } from '@/services/fsApi'
import { workspaceGraphQueryKey, workspaceGraphRequest } from '@/logic/knowledgeGraphRequest'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const WORKSPACE_GRAPH_STALE_TIME_MS = 10_000

export const preloadWorkspaceGraph = (
  queryClient: QueryClient,
  workspaceKey: string,
): Promise<void> => {
  const preferences = usePreferencesStore.getState()
  const request = workspaceGraphRequest(
    preferences.graphShowAttachments,
    preferences.graphShowMissing,
  )
  return queryClient
    .query({
      queryKey: workspaceGraphQueryKey(workspaceKey, request),
      queryFn: () => fsApi.getWorkspaceGraph(request),
      staleTime: WORKSPACE_GRAPH_STALE_TIME_MS,
    })
    .then(
      () => undefined,
      () => undefined,
    )
}
