import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { recentWorkspaceApi } from '@/services/recentWorkspaceApi'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import type { RecentWorkspace } from '@/types/recentWorkspaces'
import { useEffect, useState } from 'react'

const historyKey = ['recent-workspaces'] as const

export const useRecentWorkspaceHistory = (enabled: boolean, fallbackPaths: string[]) => {
  const supported = recentWorkspaceApi.isAvailable()
  const client = useQueryClient()
  const [watchFailed, setWatchFailed] = useState(false)
  useEffect(() => {
    if (!enabled || !supported) return
    let active = true
    let stop: (() => void) | undefined
    void recentWorkspaceApi
      .watch(() => {
        if (active) void client.invalidateQueries({ queryKey: historyKey })
      })
      .then((unsubscribe) => {
        if (active) {
          stop = unsubscribe
          setWatchFailed(false)
        } else unsubscribe()
      })
      .catch(() => {
        if (active) setWatchFailed(true)
      })
    return () => {
      active = false
      stop?.()
    }
  }, [client, enabled, supported])
  const history = useQuery({
    queryKey: historyKey,
    queryFn: async ({ signal }) => {
      const entries = await recentWorkspaceApi.list()
      signal.throwIfAborted()
      return entries
    },
    enabled: enabled && supported,
    retry: false,
    staleTime: 0,
    refetchInterval: watchFailed && enabled ? 1_000 : false,
  })
  const removal = useMutation({
    mutationFn: (path: string) => recentWorkspaceApi.remove(path),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: historyKey })
    },
    onSuccess: (_result, path) => {
      client.setQueryData<RecentWorkspace[]>(historyKey, (current) =>
        (
          current ?? fallbackPaths.map((entry) => ({ path: entry, status: 'unavailable' as const }))
        ).filter((entry) => entry.path !== path),
      )
      const state = useWorkspaceStore.getState()
      useWorkspaceStore.setState({
        recentProjects: state.recentProjects.filter((entry) => entry !== path),
      })
      void client.invalidateQueries({ queryKey: historyKey })
    },
  })

  return {
    entries:
      history.data ??
      fallbackPaths.map((path) => ({
        path,
        status: supported ? ('unavailable' as const) : ('available' as const),
      })),
    supported,
    watchFailed,
    checking: supported && history.isLoading,
    loadFailed: history.isError,
    removalFailed: removal.isError,
    removing: removal.isPending,
    remove: removal.mutate,
    retry: () => {
      void history.refetch()
    },
  }
}
