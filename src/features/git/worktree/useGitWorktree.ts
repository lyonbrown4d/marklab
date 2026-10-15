import { useRef } from 'react'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gitApiForWorkspace } from '@/services/gitApi'
import { fsApi } from '@/services/fsApi'
import { useGitRefreshOptions } from '@/features/git/useGitRefreshOptions'

export type WorktreeCommand =
  | { type: 'stage' | 'unstage' | 'discard'; paths: string[] }
  | { type: 'commit'; message: string }
  | { type: 'init' | 'pull' | 'continue' | 'abort' }
  | { type: 'fetch'; remote: string }
  | { type: 'push'; remote: string; setUpstream: boolean }
  | { type: 'setRemote'; name: string; url: string }
  | { type: 'removeRemote'; name: string }

const execute = async (rootPath: string, command: WorktreeCommand) => {
  const gitApi = gitApiForWorkspace(rootPath)
  switch (command.type) {
    case 'stage':
      await fsApi.flushBuffers()
      return gitApi.stage(command.paths)
    case 'unstage':
      return gitApi.unstage(command.paths)
    case 'discard':
      await fsApi.flushBuffers()
      return gitApi.discard(command.paths)
    case 'commit':
      await fsApi.flushBuffers()
      return gitApi.commitStaged(command.message)
    case 'init':
      await fsApi.flushBuffers()
      return gitApi.initRepo(rootPath)
    case 'fetch':
      return gitApi.fetch(command.remote)
    case 'pull':
      await fsApi.flushBuffers()
      return gitApi.pull()
    case 'push':
      return gitApi.push({ remote: command.remote, setUpstream: command.setUpstream })
    case 'setRemote':
      return gitApi.setRemote(command.name, command.url)
    case 'removeRemote':
      return gitApi.removeRemote(command.name)
    case 'continue':
      await fsApi.flushBuffers()
      return gitApi.continueOperation()
    case 'abort':
      await fsApi.flushBuffers()
      return gitApi.abortOperation()
  }
}

export const useGitWorktree = (rootPath: string, enabled: boolean, isRepository: boolean) => {
  const queryClient = useQueryClient()
  const submitting = useRef(false)
  const pendingCount = useIsMutating({ mutationKey: ['git-repository-action'] })
  const refresh = useGitRefreshOptions(rootPath)
  const remoteQuery = useQuery({
    ...refresh,
    queryKey: ['git-remote', rootPath],
    queryFn: () => gitApiForWorkspace(rootPath).getRemoteStatus(),
    enabled: enabled && isRepository,
    staleTime: 2_000,
  })
  const operationQuery = useQuery({
    ...refresh,
    queryKey: ['git-operation', rootPath],
    queryFn: () => gitApiForWorkspace(rootPath).getOperationState(),
    enabled: enabled && isRepository,
    staleTime: 2_000,
  })
  const mutation = useMutation({
    mutationKey: ['git-repository-action', rootPath],
    mutationFn: ({ root, command }: { root: string; command: WorktreeCommand }) =>
      execute(root, command),
    onSuccess: (result, { root }) => {
      if ('staged' in result) queryClient.setQueryData(['git-status', root], result)
      if ('remotes' in result) queryClient.setQueryData(['git-remote', root], result)
    },
    onSettled: async (_result, _error, { root }) => {
      // Always refresh the repository that started the action, including after a conflict failure.
      await Promise.all(
        [
          'status',
          'remote',
          'history',
          'branches',
          'stashes',
          'operation',
          'file-diff',
          'commit-files',
          'commit-diff',
          'conflict',
        ].map((namespace) =>
          queryClient.invalidateQueries({ queryKey: [`git-${namespace}`, root] }),
        ),
      )
    },
  })
  const run = async (command: WorktreeCommand) => {
    if (
      submitting.current ||
      queryClient.isMutating({ mutationKey: ['git-repository-action'] }) > 0
    )
      return false
    submitting.current = true
    try {
      await mutation.mutateAsync({ root: rootPath, command })
      return true
    } catch {
      return false
    } finally {
      submitting.current = false
    }
  }
  return {
    remoteQuery,
    operationQuery,
    mutation,
    run,
    busy: pendingCount > 0 || mutation.isPending,
  }
}
