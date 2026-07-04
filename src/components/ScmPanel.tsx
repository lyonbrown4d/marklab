/* eslint-disable max-lines */
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { GitBranch, GitCommitHorizontal, RefreshCw } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import debounce from 'lodash-es/debounce'
import { toast } from 'sonner'
import AppAlert from '@/components/AppAlert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import AppEmptyState from '@/components/AppEmptyState'
import { GitChangeRow } from '@/components/GitChangeRow'
import { GitCommitDialog } from '@/components/GitCommitDialog'
import { GitInitDialog } from '@/components/GitInitDialog'
import { GitRepositoryEmptyState } from '@/components/GitRepositoryEmptyState'
import { gitApi, type GitDiffRequest, type GitFileChange } from '@/services/gitApi'
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

type ChangeGroup = {
  id: GitDiffRequest['section']
  label: string
  changes: GitFileChange[]
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

  const groups = useMemo<ChangeGroup[]>(() => {
    const snapshot = statusQuery.data
    if (!snapshot?.repo.is_repository) return []
    const nextGroups: ChangeGroup[] = [
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
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-md"
                aria-label={singleFileLabel}
                title={singleFileLabel}
                disabled
              >
                <GitBranch aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{singleFileLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return (
      <SidebarGroup
        aria-label={t('scm.title')}
        role="region"
        className="sidebar-section rounded-md p-1"
      >
        <SidebarGroupLabel className="sidebar-section-header flex h-7 items-center justify-between px-2 text-[11px] uppercase">
          <span>{t('scm.title')}</span>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <AppEmptyState
            compact
            className="mx-2 mb-2 min-h-32 flex-none border-sidebar-border/80 bg-sidebar/40 px-4 py-5"
            description={t('scm.singleFileHelp')}
            descriptionClassName="max-w-[13rem] text-[11px] leading-4"
            icon={<GitBranch aria-hidden="true" />}
            mediaClassName="mb-1 border border-sidebar-border bg-background/70 text-muted-foreground"
            title={singleFileLabel}
            titleClassName="text-xs"
            titleLevel={3}
          />
        </SidebarGroupContent>
      </SidebarGroup>
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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={totalChanges > 0 ? 'secondary' : 'ghost'}
              size="icon"
              className="size-8 rounded-md"
              aria-busy={statusQuery.isFetching}
              aria-label={collapsedLabel}
              title={collapsedLabel}
              onClick={invalidateStatus}
            >
              <GitBranch aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsedLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
      <SidebarGroup
        aria-label={t('scm.title')}
        role="region"
        className="sidebar-section rounded-md p-1"
      >
        <SidebarGroupLabel className="sidebar-section-header flex h-7 items-center justify-between px-2 text-[11px] uppercase">
          <span>{t('scm.title')}</span>
          <div className="flex items-center gap-1">
            {statusQuery.data?.repo.is_repository && (
              <Badge variant="secondary" className="rounded px-1.5 py-0">
                {t('scm.changedFiles', { count: String(totalChanges) })}
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 rounded-md"
              aria-busy={statusQuery.isFetching}
              aria-label={t('scm.refresh')}
              title={t('scm.refresh')}
              onClick={invalidateStatus}
              disabled={statusQuery.isFetching}
            >
              {statusQuery.isFetching ? (
                <Spinner aria-hidden="true" role="presentation" />
              ) : (
                <RefreshCw aria-hidden="true" />
              )}
            </Button>
          </div>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          {statusQuery.isError ? (
            <div className="px-2 py-1 text-xs">
              <AppAlert
                role="alert"
                tone="destructive"
                title={t('scm.statusError')}
                className="px-2 py-1.5 text-xs"
              >
                {String(statusQuery.error)}
              </AppAlert>
            </div>
          ) : statusQuery.isLoading ? (
            <div
              role="status"
              aria-busy="true"
              aria-label={t('scm.loading')}
              className="flex flex-col gap-2 px-2 pb-2"
            >
              <Skeleton aria-hidden="true" className="h-8 w-full" />
              <Skeleton aria-hidden="true" className="h-8 w-10/12" />
              <Skeleton aria-hidden="true" className="h-8 w-full" />
            </div>
          ) : !statusQuery.data?.repo.is_repository ? (
            <GitRepositoryEmptyState
              isInitializing={initMutation.isPending}
              initError={initMutation.error}
              onOpenInitDialog={() => {
                initMutation.reset()
                setInitDialogOpen(true)
              }}
            />
          ) : (
            <div className="flex flex-col gap-2 pb-2">
              <div className="flex flex-col gap-1 px-2 text-xs">
                <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <GitCommitHorizontal aria-hidden="true" className="size-4 shrink-0" />
                  <span className="truncate">{branch}</span>
                  <span className="ml-auto shrink-0">
                    {t('scm.changedFiles', { count: String(totalChanges) })}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">{t('scm.workflowHint')}</div>
              </div>
              <Separator className="bg-sidebar-border/70" />
              {totalChanges > 0 && (
                <div className="flex flex-col gap-1.5 px-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 w-full justify-start rounded-md px-2 text-xs"
                    aria-describedby={hasConflicts ? commitDisabledReasonId : undefined}
                    disabled={commitMutation.isPending || hasConflicts}
                    title={commitDisabledReason ?? t('scm.commitAll')}
                    onClick={() => {
                      commitMutation.reset()
                      setCommitDialogOpen(true)
                    }}
                  >
                    {commitMutation.isPending ? (
                      <Spinner aria-hidden="true" role="presentation" data-icon="inline-start" />
                    ) : (
                      <GitCommitHorizontal data-icon="inline-start" />
                    )}
                    {commitMutation.isPending ? t('scm.committing') : t('scm.openCommitDialog')}
                  </Button>
                  {hasConflicts && (
                    <div
                      id={commitDisabledReasonId}
                      role="alert"
                      className="text-[11px] text-destructive"
                    >
                      {t('scm.commitBlockedConflicts')}
                    </div>
                  )}
                </div>
              )}
              {groups.length === 0 ? (
                <AppEmptyState
                  compact
                  className="mx-2 min-h-28 flex-none border-sidebar-border/80 bg-sidebar/30 px-4 py-4"
                  description={t('scm.clean')}
                  descriptionClassName="max-w-[13rem] text-[11px] leading-4"
                  icon={<GitCommitHorizontal aria-hidden="true" />}
                  mediaClassName="mb-1 border border-sidebar-border bg-background/70 text-muted-foreground"
                  role="status"
                  title={t('scm.noChangesTitle')}
                  titleClassName="text-xs"
                  titleLevel={3}
                />
              ) : (
                <SidebarMenu className="flex flex-col gap-2">
                  {groups.map((group) => {
                    const groupLabelId = `scm-${group.id}-label`

                    return (
                      <SidebarMenuItem key={group.id} className="flex flex-col gap-1">
                        <div className="flex h-6 items-center justify-between px-2 text-[11px] font-medium uppercase text-muted-foreground">
                          <span id={groupLabelId}>{group.label}</span>
                          <Badge variant="secondary" className="h-5 rounded px-1.5 py-0">
                            {group.changes.length}
                          </Badge>
                        </div>
                        <div
                          role="group"
                          aria-labelledby={groupLabelId}
                          className="flex flex-col gap-1 px-1"
                        >
                          {group.changes.slice(0, 8).map((change) => (
                            <GitChangeRow
                              key={`${group.id}:${change.path}:${change.status}`}
                              change={change}
                              section={group.id}
                              onOpenDiff={onOpenDiff}
                              diffLabel={t('scm.openDiff')}
                              renamedFromLabel={t('scm.renamedFrom')}
                            />
                          ))}
                          {group.changes.length > 8 && (
                            <div className="px-2 text-[11px] text-muted-foreground">
                              {t('scm.moreChanges', {
                                count: String(group.changes.length - 8),
                              })}
                            </div>
                          )}
                        </div>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              )}
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  )
}

export default ScmPanel
