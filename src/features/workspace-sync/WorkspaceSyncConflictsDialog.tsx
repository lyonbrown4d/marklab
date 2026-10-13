import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import { useI18n } from '@/i18n/useI18n'
import { syncQueryKeys, useSyncConflicts } from '@/features/workspace-sync/syncQueries'
import { workspaceSyncApi } from '@/services/workspaceSyncApi'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import type {
  WorkspaceSyncConflictResolution,
  WorkspaceSyncConflictVersion,
} from '@/types/workspaceSync'

type Props = { rootPath: string; open: boolean; onOpenChange: (open: boolean) => void }

export const WorkspaceSyncConflictsDialog = (props: Props) => {
  const conflicts = useSyncConflicts(props.rootPath, props.open)
  const binding = conflicts.data?.binding
  return (
    <ConflictDialog
      key={`${props.rootPath}:${binding?.profileId ?? ''}:${binding?.remoteRoot ?? ''}:${props.open}`}
      {...props}
    />
  )
}

const ConflictDialog = ({ rootPath, open, onOpenChange }: Props) => {
  const { t } = useI18n()
  const client = useQueryClient()
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [deleteConsent, setDeleteConsent] = useState<string | null>(null)
  const conflicts = useSyncConflicts(rootPath, open)
  const binding = conflicts.data?.binding
  const path =
    conflicts.data?.conflicts.find((conflict) => conflict.path === selectedPath)?.path ??
    conflicts.data?.conflicts[0]?.path
  const comparison = useQuery({
    queryKey: ['workspace-sync', 'comparison', rootPath, binding, path],
    queryFn: async () => {
      await flushEditorChanges()
      return workspaceSyncApi.readConflict({ rootPath, path: path!, binding: binding! })
    },
    enabled: open && Boolean(binding && path),
    staleTime: 0,
  })
  const consentIdentity =
    comparison.data && path
      ? JSON.stringify([path, comparison.data.local.hash, comparison.data.savedRemote.hash])
      : null
  const confirmDelete = consentIdentity !== null && deleteConsent === consentIdentity
  const resolution = useMutation({
    mutationFn: async (request: WorkspaceSyncConflictResolution) => {
      await flushEditorChanges()
      return workspaceSyncApi.resolveConflict(request)
    },
    onSuccess: async (_result, request) => {
      setSelectedPath(null)
      setDeleteConsent(null)
      await client.invalidateQueries({ queryKey: syncQueryKeys.conflicts(request.rootPath) })
      await client.invalidateQueries({
        queryKey: ['workspace-sync', 'comparison', request.rootPath],
      })
    },
  })
  useNativeSurfaceOcclusion('workspace-sync-conflicts-dialog', open, { blocksCommandPalette: true })
  const resolve = (choice: 'local' | 'remote') => {
    if (!binding || !path || !comparison.data || resolution.isPending) return
    resolution.mutate({
      rootPath,
      path,
      binding,
      choice,
      confirmDelete,
      expectedLocalHash: comparison.data.local.hash,
      expectedRemoteHash: comparison.data.savedRemote.hash,
    })
  }
  const error = conflicts.error ?? comparison.error ?? resolution.error
  const version = (label: string, data: WorkspaceSyncConflictVersion) => (
    <section className="min-w-0 rounded border p-3">
      <h3 className="mb-2 text-sm font-medium">{t(label)}</h3>
      {data.text !== null ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
          {data.text || t('sync.conflicts.emptyFile')}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">{t(`sync.conflicts.${data.unavailable}`)}</p>
      )}
    </section>
  )
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!resolution.isPending) onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('sync.conflicts.title')}</DialogTitle>
          <DialogDescription>{t('sync.conflicts.description')}</DialogDescription>
        </DialogHeader>
        {conflicts.isLoading ? <p role="status">{t('sync.center.loading')}</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error instanceof Error ? error.message : t('sync.conflicts.failed')}
          </p>
        ) : null}
        {error ? (
          <Button
            variant="outline"
            onClick={() => {
              resolution.reset()
              void conflicts.refetch()
              void comparison.refetch()
            }}
          >
            {t('sync.conflicts.refresh')}
          </Button>
        ) : null}
        {!conflicts.isLoading && !error && !conflicts.data?.conflicts.length ? (
          <p>{t('sync.conflicts.none')}</p>
        ) : null}
        {conflicts.data?.conflicts.length ? (
          <div
            className="max-h-32 overflow-auto rounded border p-1"
            aria-label={t('sync.conflicts.list')}
          >
            {conflicts.data.conflicts.map((conflict) => (
              <Button
                key={conflict.path}
                variant={path === conflict.path ? 'secondary' : 'ghost'}
                className="flex h-auto w-full items-start justify-between gap-3 whitespace-normal text-left"
                disabled={resolution.isPending}
                onClick={() => {
                  setSelectedPath(conflict.path)
                  setDeleteConsent(null)
                  resolution.reset()
                }}
              >
                <span className="min-w-0 break-all">{conflict.path}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t(`sync.conflicts.reason.${conflict.reason}`)}
                </span>
              </Button>
            ))}
          </div>
        ) : null}
        {comparison.isFetching && path ? (
          <p role="status">{t('sync.conflicts.loadingVersions')}</p>
        ) : null}
        {comparison.data && path ? (
          <>
            {comparison.data.conflict.conflictPath ? (
              <p className="break-all text-xs text-muted-foreground">
                {t('sync.conflicts.savedPath', { path: comparison.data.conflict.conflictPath })}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {version('sync.conflicts.local', comparison.data.local)}
              {version('sync.conflicts.remote', comparison.data.savedRemote)}
            </div>
            <p className="text-xs text-muted-foreground">{t('sync.conflicts.resolutionHint')}</p>
            {comparison.data.local.hash === null || comparison.data.savedRemote.hash === null ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={confirmDelete}
                  onCheckedChange={(checked) =>
                    setDeleteConsent(checked === true ? consentIdentity : null)
                  }
                  disabled={resolution.isPending}
                />
                {t('sync.conflicts.confirmDelete')}
              </label>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                disabled={
                  resolution.isPending ||
                  comparison.isFetching ||
                  comparison.isError ||
                  (comparison.data.savedRemote.hash === null && !confirmDelete)
                }
                onClick={() => resolve('remote')}
              >
                {t('sync.conflicts.useRemote')}
              </Button>
              <Button
                disabled={
                  resolution.isPending ||
                  comparison.isFetching ||
                  comparison.isError ||
                  (comparison.data.local.hash === null && !confirmDelete)
                }
                onClick={() => resolve('local')}
              >
                {resolution.isPending
                  ? t('sync.conflicts.resolving')
                  : t('sync.conflicts.useLocal')}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
