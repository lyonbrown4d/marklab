import { useEffect, useMemo, useRef, useState } from 'react'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gitApiForWorkspace } from '@/services/gitApi'
import type { GitConflictSnapshot } from '@/types/gitConflicts'
import { useI18n } from '@/i18n/useI18n'
import { hasConflictMarkers, parseConflictMarkers } from '@/features/git/conflicts/conflictMarkers'
import {
  discardGitConflictDraft,
  readGitConflictDraft,
  registerGitConflictSaveHandler,
  storeGitConflictDraft,
  type GitConflictDraft,
} from '@/features/git/conflicts/conflictDraftStore'

type Draft = GitConflictDraft & {
  snapshot: GitConflictSnapshot
  savedContent: string
  savedDeleted: boolean
  dirty: boolean
  verified: boolean
}

export const useConflictResolution = (rootPath: string, path: string, onStaged: () => void) => {
  const { t } = useI18n()
  const client = useQueryClient()
  const api = useMemo(() => gitApiForWorkspace(rootPath), [rootPath])
  const [draft, setDraft] = useState<Draft | null>(null)
  const latest = useRef<Draft | null>(null)
  const saving = useRef(false)
  const query = useQuery({
    queryKey: ['git-conflict', rootPath, path],
    queryFn: () => api.getConflict(path),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    gcTime: 0,
  })
  const publish = (next: Draft) => {
    latest.current = next
    if (next.dirty) storeGitConflictDraft(rootPath, path, next, t('scm.merge.unsavedClose'))
    else discardGitConflictDraft(rootPath, path)
    setDraft(next)
  }
  useEffect(() => {
    let mounted = true
    const initialize = () => {
      if (!mounted || latest.current) return
      const current = client.getQueryState<GitConflictSnapshot>(['git-conflict', rootPath, path])
      if (!current || current.fetchStatus === 'fetching') return
      const restored = readGitConflictDraft(rootPath, path)
      if (!current.data && !restored) return
      // An externally resolved index must not hide the only surviving draft.
      // Null fallback sides are unavailable, rather than verified deletions.
      const snapshot: GitConflictSnapshot = current.data ?? {
        path,
        base: null,
        ours: null,
        theirs: null,
        result: restored!.content,
        revision: restored!.revision,
        deleted: restored!.deleteFile,
      }
      const next: Draft = {
        content: snapshot.result,
        revision: snapshot.revision,
        deleteFile: snapshot.deleted,
        deletionConfirmed: false,
        ...restored,
        snapshot,
        savedContent: snapshot.result,
        savedDeleted: snapshot.deleted,
        dirty: Boolean(restored),
        verified: Boolean(current.data && current.status === 'success'),
      }
      latest.current = next
      setDraft(next)
    }
    const unsubscribe = client.getQueryCache().subscribe(({ query: changed }) => {
      const [namespace, root, file] = changed.queryKey
      if (namespace === 'git-conflict' && root === rootPath && file === path) initialize()
    })
    // Reconcile a request that completed before the subscription was attached.
    queueMicrotask(initialize)
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [client, path, rootPath])
  const mutation = useMutation({
    mutationKey: ['git-repository-action', rootPath],
    mutationFn: ({ value, stage }: { value: Draft; stage: boolean }) =>
      api.saveConflict({
        path,
        content: value.content,
        revision: value.revision,
        stage,
        deleteFile: value.deleteFile,
      }),
    onSettled: async () => {
      await Promise.all(
        [
          'git-status',
          'git-remote',
          'git-history',
          'git-branches',
          'git-stashes',
          'git-operation',
          'git-file-diff',
          'git-commit-files',
          'git-commit-diff',
          'git-conflict',
        ].map((key) => client.invalidateQueries({ queryKey: [key, rootPath] })),
      )
    },
  })
  const pending = useIsMutating({ mutationKey: ['git-repository-action'] }) > 0
  const update = (content: string, deleteFile = false, deletionConfirmed = false) => {
    const previous = latest.current
    if (!previous || saving.current) return
    const dirty =
      !previous.verified ||
      content !== previous.savedContent ||
      deleteFile !== previous.savedDeleted ||
      previous.revision !== previous.snapshot.revision
    publish({ ...previous, content, deleteFile, deletionConfirmed, dirty })
  }
  const save = async (stage = false) => {
    const value = latest.current
    if (
      !value ||
      !value.verified ||
      !query.isSuccess ||
      query.isFetching ||
      saving.current ||
      client.isMutating({ mutationKey: ['git-repository-action'] }) ||
      (value.deleteFile && !value.deletionConfirmed) ||
      (stage && hasConflictMarkers(value.content, value.snapshot.markerSize ?? 7))
    )
      return false
    saving.current = true
    try {
      const response = await mutation.mutateAsync({ value, stage })
      const next = {
        ...value,
        revision: response.revision,
        savedContent: value.content,
        savedDeleted: value.deleteFile,
        dirty: false,
        snapshot: {
          ...value.snapshot,
          result: value.content,
          deleted: value.deleteFile,
          revision: response.revision,
        },
      }
      publish(next)
      if (response.staged) onStaged()
      return true
    } catch {
      return false
    } finally {
      saving.current = false
    }
  }
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(
    () => registerGitConflictSaveHandler(rootPath, path, () => saveRef.current(false)),
    [rootPath, path],
  )
  const discard = () => {
    discardGitConflictDraft(rootPath, path)
    if (latest.current)
      publish({
        ...latest.current,
        content: latest.current.savedContent,
        deleteFile: latest.current.savedDeleted,
        dirty: false,
      })
  }
  const reload = async () => {
    if (pending || saving.current) return false
    const refreshed = await query.refetch()
    if (!refreshed.data || refreshed.error) return false
    const snapshot = refreshed.data
    publish({
      content: snapshot.result,
      revision: snapshot.revision,
      deleteFile: snapshot.deleted,
      deletionConfirmed: false,
      snapshot,
      savedContent: snapshot.result,
      savedDeleted: snapshot.deleted,
      dirty: false,
      verified: true,
    })
    mutation.reset()
    return true
  }
  return {
    draft,
    query,
    pending,
    canWrite: Boolean(draft?.verified && query.isSuccess && !query.isFetching),
    error: mutation.error,
    update,
    save,
    discard,
    reload,
    blocks: parseConflictMarkers(draft?.content ?? '', draft?.snapshot.markerSize ?? 7),
    unresolved: hasConflictMarkers(draft?.content ?? '', draft?.snapshot.markerSize ?? 7),
    stale: Boolean(
      draft && query.data && draft.revision !== query.data.revision && !query.isFetching,
    ),
  }
}
