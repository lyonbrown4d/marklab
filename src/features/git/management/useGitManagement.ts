import { useMemo, useRef } from 'react'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gitApiForWorkspace } from '@/services/gitApi'
import { useGitRefreshOptions } from '@/features/git/useGitRefreshOptions'

export const useGitManagement = (rootPath: string, enabled: boolean) => {
  const client = useQueryClient()
  const api = useMemo(() => gitApiForWorkspace(rootPath), [rootPath])
  const guard = useRef(false)
  const refresh = useGitRefreshOptions(rootPath)
  const operation = useQuery({
    ...refresh,
    queryKey: ['git-operation', rootPath],
    queryFn: () => api.getOperationState(),
    enabled,
  })
  const mutation = useMutation({
    mutationKey: ['git-repository-action', rootPath],
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSettled: async () => {
      await Promise.all(
        [
          'git-status',
          'git-remote',
          'git-history',
          'git-branches',
          'git-stashes',
          'git-operation',
          'git-commit-files',
          'git-commit-diff',
          'git-file-diff',
          'git-conflict',
        ].map((key) => client.invalidateQueries({ queryKey: [key, rootPath] })),
      )
    },
  })
  const pending = useIsMutating({ mutationKey: ['git-repository-action'] }) > 0
  const run = async (action: () => Promise<unknown>) => {
    if (guard.current || client.isMutating({ mutationKey: ['git-repository-action'] })) return false
    guard.current = true
    try {
      await mutation.mutateAsync(action)
      return true
    } catch {
      return false
    } finally {
      guard.current = false
    }
  }
  return { operation, pending, error: mutation.error, run }
}

export type GitManagementActions = {
  rootPath: string
  disabled: boolean
  pending: boolean
  error: unknown
  run: (action: () => Promise<unknown>) => Promise<boolean>
}
