import type { QueryClient } from '@tanstack/react-query'

import { fsApi } from '@/services/fsApi'

const WORKSPACE_GRAPH_STALE_TIME_MS = 10_000

export const preloadWorkspaceGraph = (
  queryClient: QueryClient,
  workspaceKey: string,
): Promise<void> =>
  queryClient
    .query({
      queryKey: ['workspace-graph', workspaceKey],
      queryFn: () => fsApi.getWorkspaceGraph(),
      staleTime: WORKSPACE_GRAPH_STALE_TIME_MS,
    })
    .then(
      () => undefined,
      () => undefined,
    )
