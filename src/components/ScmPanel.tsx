import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import debounce from 'lodash-es/debounce'
import { toast } from 'sonner'
import {
  ScmCollapsedButton,
  ScmRepositoryPanel,
  ScmSingleFilePanel,
} from '@/components/ScmPanelContent'
import type { ScmChangeGroup } from '@/components/ScmChangeGroups'
import { GitCommitDialog } from '@/components/GitCommitDialog'
import { GitInitDialog } from '@/components/GitInitDialog'
import { gitApi, type GitDiffRequest } from '@/services/gitApi'
import { fsApi } from '@/services/fsApi'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { useI18n } from '@/i18n/useI18n'
import { countChangedFiles, gitStatusQueryKey } from '@/logic/gitStatus'

type ScmPanelProps = {
  rootPath: string
  rootKind: 'internal' | 'external' | 'single'
  collapsed: boolean
  onOpenDiff: (request: GitDiffRequest) => void
}

const ScmPanel = ({ rootPath, rootKind, collapsed, onOpenDiff }: ScmPanelProps) => {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const commitDisabledReasonId = useId()
  const [commitMessage, setCommitMessage] = useState('')
  const [commitDialogOpen, setCommitDialogOpen] = useState(false)
  const [initDialogOpen, setInitDialogOpen] = useState(false)
  const enabled = isDesktopRuntime() && rootKind !== 'single' && Boolean(rootPath)
  const queryKey = useMemo(() => gitStatusQueryKey(rootPath), [rootPath])

  const statusQuery = useQuery({
    queryKey,
    queryFn: () => gitApi.getStatus(rootPath),
    enabled,
    staleTime: 2_000,
  })

  const invalidateStatus = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey }).catch((error) => {
      toast.error(t('scm.statusRefreshFailed'), {
        id: 'scm-status-refresh',
        description: String(error),
      })
    })
  }, [queryClient, queryKey, t])

  const debouncedInvalidateStatus = useMemo(
    () => debounce(invalidateStatus, 250),
    [invalidateStatus],
  )

  useEffect(() => {
    if (!enabled) return
    let unlisten: (() => void) | undefined

    void listen('fs-changed', () => {
      debouncedInvalidateStatus()
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      debouncedInvalidateStatus.cancel()
      if (unlisten) unlisten()
    }
  }, [debouncedInvalidateStatus, enabled])

  const initMutation = useMutation({
    mutationFn: async () => {
      await fsApi.flushBuffers()
      return gitApi.initRepo(rootPath)
    },
    onMutate: () => {
      toast.loading(t('scm.initializing'), {
        id: 'scm-init',
      })
    },
    onSuccess: () => {
      setInitDialogOpen(false)
      toast.success(t('scm.initSuccess'), {
        id: 'scm-init',
      })
      invalidateStatus()
    },
    onError: (error) => {
      toast.error(t('scm.initFailed'), {
        id: 'scm-init',
        description: String(error),
      })
    },
  })

  const commitMutation = useMutation({
    mutationFn: async () => {
      await fsApi.flushBuffers()
      return gitApi.commitAll(rootPath, commitMessage.trim())
    },
    onMutate: () => {
      toast.loading(t('scm.committing'), {
        id: 'scm-commit',
      })
    },
    onSuccess: (snapshot) => {
      setCommitMessage('')
      setCommitDialogOpen(false)
      queryClient.setQueryData(queryKey, snapshot)
      toast.success(t('scm.commitSuccess'), {
        id: 'scm-commit',
      })
      invalidateStatus()
    },
    onError: (error) => {
      toast.error(t('scm.commitFailed'), {
        id: 'scm-commit',
        description: String(error),
      })
    },
  })

  const groups = useMemo<ScmChangeGroup[]>(() => {
    const snapshot = statusQuery.data
    if (!snapshot?.repo.is_repository) return []
    const nextGroups: ScmChangeGroup[] = [
      { id: 'conflicts', label: t('scm.conflicts'), changes: snapshot.conflicts },
      { id: 'staged', label: t('scm.staged'), changes: snapshot.staged },
      { id: 'unstaged', label: t('scm.changes'), changes: snapshot.unstaged },
      { id: 'untracked', label: t('scm.untracked'), changes: snapshot.untracked },
    ]
    return nextGroups.filter((group) => group.changes.length > 0)
  }, [statusQuery.data, t])

  if (rootKind === 'single') {
    const singleFileLabel = t('scm.singleFileTitle')

    if (collapsed) {
      return <ScmCollapsedButton label={singleFileLabel} disabled />
    }

    return (
      <ScmSingleFilePanel
        regionLabel={t('scm.title')}
        title={singleFileLabel}
        description={t('scm.singleFileHelp')}
      />
    )
  }

  if (!enabled) return null

  const totalChanges = countChangedFiles(statusQuery.data)
  const branch = statusQuery.data?.repo.branch ?? t('scm.noBranch')
  const hasConflicts = Boolean(statusQuery.data?.conflicts.length)
  const canCommit =
    totalChanges > 0 &&
    !hasConflicts &&
    commitMessage.trim().length > 0 &&
    !commitMutation.isPending
  const commitDisabledReason = hasConflicts ? t('scm.commitBlockedConflicts') : undefined
  const collapsedLabel = statusQuery.data?.repo.is_repository
    ? t('scm.collapsedStatus', { count: String(totalChanges) })
    : t('scm.notRepository')

  if (collapsed) {
    return (
      <ScmCollapsedButton
        label={collapsedLabel}
        busy={statusQuery.isFetching}
        disabled={statusQuery.isFetching}
        variant={totalChanges > 0 ? 'secondary' : 'ghost'}
        onClick={invalidateStatus}
      />
    )
  }

  return (
    <>
      <GitCommitDialog
        open={commitDialogOpen}
        onOpenChange={(nextOpen) => {
          if (commitMutation.isPending) return
          setCommitDialogOpen(nextOpen)
        }}
        branch={branch}
        changedFilesCount={totalChanges}
        message={commitMessage}
        onMessageChange={setCommitMessage}
        onCommit={() => commitMutation.mutate()}
        canCommit={canCommit}
        isCommitting={commitMutation.isPending}
        error={commitMutation.error}
        disabledReason={commitDisabledReason}
      />
      <GitInitDialog
        open={initDialogOpen}
        onOpenChange={(nextOpen) => {
          if (initMutation.isPending) return
          setInitDialogOpen(nextOpen)
        }}
        onConfirm={() => initMutation.mutate()}
        isInitializing={initMutation.isPending}
        error={initMutation.error}
      />
      <ScmRepositoryPanel
        branch={branch}
        commitDisabledReason={commitDisabledReason}
        commitDisabledReasonId={commitDisabledReasonId}
        groups={groups}
        hasConflicts={hasConflicts}
        initError={initMutation.error}
        isCommitting={commitMutation.isPending}
        isInitializing={initMutation.isPending}
        isRepository={Boolean(statusQuery.data?.repo.is_repository)}
        isStatusError={statusQuery.isError}
        isStatusFetching={statusQuery.isFetching}
        isStatusLoading={statusQuery.isLoading}
        onOpenCommitDialog={() => {
          commitMutation.reset()
          setCommitDialogOpen(true)
        }}
        onOpenDiff={onOpenDiff}
        onOpenInitDialog={() => {
          initMutation.reset()
          setInitDialogOpen(true)
        }}
        onRefresh={invalidateStatus}
        statusError={statusQuery.error}
        totalChanges={totalChanges}
      />
    </>
  )
}

export default ScmPanel
