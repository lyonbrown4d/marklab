import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { workspaceSyncApi } from '@/services/workspaceSyncApi'
import type { WorkspaceSyncChannel } from '@/types/workspaceSync'

export const syncQueryKeys = {
  channels: (rootPath: string) => ['workspace-sync', 'channels', rootPath] as const,
  profiles: ['workspace-sync', 'webdav-profiles'] as const,
}

export const useSyncChannels = (rootPath: string, enabled: boolean) =>
  useQuery({
    queryKey: syncQueryKeys.channels(rootPath),
    queryFn: workspaceSyncApi.getChannels,
    enabled,
    staleTime: 2_000,
  })

export const useWebDavProfiles = (enabled = true) =>
  useQuery({
    queryKey: syncQueryKeys.profiles,
    queryFn: workspaceSyncApi.listWebDavProfiles,
    enabled,
  })

export const useSetSyncChannel = (rootPath: string) => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (channel: WorkspaceSyncChannel) => workspaceSyncApi.setChannel(channel),
    onSuccess: (channels) => client.setQueryData(syncQueryKeys.channels(rootPath), channels),
  })
}

export const useRemoveSyncChannel = (rootPath: string) => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => workspaceSyncApi.removeChannel(),
    onSuccess: (channels) => client.setQueryData(syncQueryKeys.channels(rootPath), channels),
  })
}
