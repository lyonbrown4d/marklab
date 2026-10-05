import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  useGitSummary,
  useSyncChannels,
  useWebDavProfiles,
} from '@/features/workspace-sync/syncQueries'
import {
  createRootSyncState,
  normalizeSyncRoot,
  type RootSyncState,
  updateRootSyncState,
} from '@/features/workspace-sync/workspaceSyncRuntimeState'
import { workspaceSyncApi } from '@/services/workspaceSyncApi'
import type {
  WebDavWorkspaceSyncChannel,
  WorkspaceSyncProgress,
  WorkspaceSyncResult,
} from '@/types/workspaceSync'

type WebDavStatus =
  | { status: 'unbound' }
  | { status: 'idle'; label: string; conflictCount: number }
  | { status: 'syncing'; label: string; progress: number; stage: string }
  | { status: 'error'; label: string; message?: string; messageKey?: string }

type ResolveWebDavStatusOptions = {
  channel: WebDavWorkspaceSyncChannel | null | undefined
  profileLabel?: string
  progress: WorkspaceSyncProgress | null
  result: WorkspaceSyncResult | null
  syncError: unknown
  syncing: boolean
  unavailable: boolean
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const isAbortError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'

const resolveWebDavStatus = ({
  channel,
  profileLabel,
  progress,
  result,
  syncError,
  syncing,
  unavailable,
}: ResolveWebDavStatusOptions): WebDavStatus => {
  const label = profileLabel ?? channel?.profileId ?? ''
  if (unavailable) return { status: 'error', label, messageKey: 'sync.center.statusUnavailable' }
  if (!channel) return { status: 'unbound' }
  if (syncing) {
    const percent = progress?.total ? Math.round((progress.completed / progress.total) * 100) : 0
    return { status: 'syncing', label, progress: percent, stage: progress?.stage ?? 'flushing' }
  }
  if (syncError) return { status: 'error', label, message: errorMessage(syncError) }
  return { status: 'idle', label, conflictCount: result?.conflicts.length ?? 0 }
}

type UseWorkspaceSyncStatusOptions = {
  rootKind: 'internal' | 'external' | 'single'
  rootPath: string
}

type SyncRequest = { rootKey: string; requestId: string }
type CancelRequest = SyncRequest

export const useWorkspaceSyncStatus = ({ rootKind, rootPath }: UseWorkspaceSyncStatusOptions) => {
  const enabled = rootKind !== 'single' && Boolean(rootPath)
  const channels = useSyncChannels(rootPath, enabled)
  const git = useGitSummary(rootPath, enabled)
  const profiles = useWebDavProfiles(enabled)
  const rootKey = normalizeSyncRoot(rootPath)
  const [syncStates, setSyncStates] = useState<Map<string, RootSyncState>>(() => new Map())
  const startPendingRoots = useRef(new Set<string>())
  const cancelPendingRoots = useRef(new Set<string>())
  const visibleState = syncStates.get(rootKey) ?? createRootSyncState()

  const updateRoot = (key: string, update: (state: RootSyncState) => RootSyncState) => {
    setSyncStates((current) => updateRootSyncState(current, key, update))
  }

  useEffect(() => {
    if (!enabled) return undefined
    return workspaceSyncApi.onProgress((event) => {
      setSyncStates((current) => {
        const entry = [...current.entries()].find(
          ([, state]) => state.requestId === event.requestId,
        )
        if (!entry) return current
        return updateRootSyncState(current, entry[0], (state) => ({
          ...state,
          progress: event.progress,
        }))
      })
    })
  }, [enabled])

  const start = useMutation({
    mutationFn: ({ requestId }: SyncRequest) => workspaceSyncApi.start(requestId),
    onMutate: (request) => {
      updateRoot(request.rootKey, () => ({
        requestId: request.requestId,
        phase: 'syncing',
        result: null,
        progress: { stage: 'flushing', completed: 0, total: 0 },
        error: null,
        cancelPending: false,
        cancelError: null,
      }))
    },
    onSuccess: (result, request) => {
      startPendingRoots.current.delete(request.rootKey)
      cancelPendingRoots.current.delete(request.rootKey)
      updateRoot(request.rootKey, (current) =>
        current.requestId === request.requestId
          ? {
              ...current,
              phase: 'completed',
              result,
              progress: { stage: 'completed', completed: 1, total: 1 },
              error: null,
              cancelPending: false,
            }
          : current,
      )
    },
    onError: (error, request) => {
      startPendingRoots.current.delete(request.rootKey)
      cancelPendingRoots.current.delete(request.rootKey)
      updateRoot(request.rootKey, (current) => {
        if (current.requestId !== request.requestId) return current
        if (isAbortError(error)) return createRootSyncState()
        return {
          ...current,
          phase: 'error',
          result: null,
          progress: null,
          error: errorMessage(error),
          cancelPending: false,
        }
      })
    },
  })
  const cancel = useMutation({
    mutationFn: ({ requestId }: CancelRequest) => workspaceSyncApi.cancel(requestId),
    onSuccess: ({ cancelled }, request) => {
      if (cancelled) return
      cancelPendingRoots.current.delete(request.rootKey)
      updateRoot(request.rootKey, (current) =>
        current.requestId === request.requestId ? { ...current, cancelPending: false } : current,
      )
    },
    onError: (error, request) => {
      cancelPendingRoots.current.delete(request.rootKey)
      updateRoot(request.rootKey, (current) =>
        current.requestId === request.requestId
          ? { ...current, cancelPending: false, cancelError: errorMessage(error) }
          : current,
      )
    },
  })
  const webdavChannel = channels.data?.webdav
  const profileLabel = useMemo(
    () => profiles.data?.find((profile) => profile.id === webdavChannel?.profileId)?.label,
    [profiles.data, webdavChannel?.profileId],
  )
  const webdav = resolveWebDavStatus({
    channel: webdavChannel,
    profileLabel,
    progress: visibleState.progress,
    result: visibleState.result,
    syncError: visibleState.error,
    syncing: visibleState.phase === 'syncing',
    unavailable: channels.isError || profiles.isError,
  })

  return {
    git: git.isError
      ? { status: 'error' as const }
      : (git.data ?? { status: 'not_repository' as const }),
    gitLoading: git.isLoading,
    gitFetching: git.isFetching,
    loading: channels.isLoading || profiles.isLoading || git.isLoading,
    webdav,
    cancelError: visibleState.cancelError,
    cancelPending: visibleState.cancelPending,
    onStart: () => {
      if (!enabled || visibleState.phase === 'syncing' || startPendingRoots.current.has(rootKey)) {
        return
      }
      startPendingRoots.current.add(rootKey)
      start.mutate({ rootKey, requestId: crypto.randomUUID() })
    },
    onCancel: () => {
      if (
        cancelPendingRoots.current.has(rootKey) ||
        !visibleState.requestId ||
        visibleState.phase !== 'syncing'
      ) {
        return
      }
      cancelPendingRoots.current.add(rootKey)
      const requestId = visibleState.requestId
      updateRoot(rootKey, (current) => ({
        ...current,
        cancelPending: true,
        cancelError: null,
      }))
      cancel.mutate({ rootKey, requestId })
    },
    onRetryGit: () => git.refetch(),
  }
}
