import { useCallback, useEffect, useMemo, useState } from 'react'
import { GitBranch, GitCommitHorizontal, RefreshCw } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import debounce from 'lodash-es/debounce'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
      console.error('refresh git status failed', error)
    })
  }, [queryClient, queryKey])

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
    onSuccess: () => {
      setInitDialogOpen(false)
      invalidateStatus()
    },
  })

  const commitMutation = useMutation({
    mutationFn: async () => {
      await fsApi.flushBuffers()
      return gitApi.commitAll(rootPath, commitMessage.trim())
    },
    onSuccess: (snapshot) => {
      setCommitMessage('')
      setCommitDialogOpen(false)
      queryClient.setQueryData(queryKey, snapshot)
      invalidateStatus()
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

  if (collapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={totalChanges > 0 ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8 rounded-md"
              onClick={invalidateStatus}
            >
              <GitBranch className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {statusQuery.data?.repo.is_repository
              ? t('scm.collapsedStatus', { count: String(totalChanges) })
              : t('scm.notRepository')}
          </TooltipContent>
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
      <SidebarGroup className="sidebar-section rounded-md p-1">
        <SidebarGroupLabel className="sidebar-section-header flex h-7 items-center justify-between px-2 text-[11px] uppercase">
          <span>{t('scm.title')}</span>
          <div className="flex items-center gap-1">
            {statusQuery.data?.repo.is_repository && (
              <Badge variant="secondary" className="rounded px-1.5 py-0">
                {t('scm.changedFiles', { count: String(totalChanges) })}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-md"
              onClick={invalidateStatus}
              disabled={statusQuery.isFetching}
              aria-label={t('scm.refresh')}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${statusQuery.isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          {statusQuery.isError ? (
            <div className="space-y-1 px-2 py-1 text-xs">
              <div className="font-medium text-destructive">{t('scm.statusError')}</div>
              <div className="text-destructive/80">{String(statusQuery.error)}</div>
            </div>
          ) : statusQuery.isLoading ? (
            <div className="px-2 pb-1 text-xs text-muted-foreground">{t('scm.loading')}</div>
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
            <div className="space-y-2 pb-2">
              <div className="space-y-1 px-2 text-xs">
                <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <GitCommitHorizontal className="h-4 w-4 shrink-0" />
                  <span className="truncate">{branch}</span>
                  <span className="ml-auto shrink-0">
                    {t('scm.changedFiles', { count: String(totalChanges) })}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">{t('scm.workflowHint')}</div>
              </div>
              <Separator className="bg-sidebar-border/70" />
              {totalChanges > 0 && (
                <div className="space-y-1.5 px-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 w-full justify-start rounded-md px-2 text-xs"
                    disabled={commitMutation.isPending || hasConflicts}
                    title={t('scm.commitAll')}
                    onClick={() => {
                      commitMutation.reset()
                      setCommitDialogOpen(true)
                    }}
                  >
                    <GitCommitHorizontal className="h-4 w-4" />
                    {commitMutation.isPending ? t('scm.committing') : t('scm.openCommitDialog')}
                  </Button>
                  {hasConflicts && (
                    <div className="text-[11px] text-destructive">
                      {t('scm.commitBlockedConflicts')}
                    </div>
                  )}
                </div>
              )}
              {groups.length === 0 ? (
                <div className="mx-2 rounded-md border border-sidebar-border/70 p-2 text-xs">
                  <div className="font-medium text-sidebar-foreground">
                    {t('scm.noChangesTitle')}
                  </div>
                  <div className="mt-1 text-muted-foreground">{t('scm.clean')}</div>
                </div>
              ) : (
                <SidebarMenu className="space-y-2">
                  {groups.map((group) => (
                    <SidebarMenuItem key={group.id} className="space-y-1">
                      <div className="flex h-6 items-center justify-between px-2 text-[11px] font-medium uppercase text-muted-foreground">
                        <span>{group.label}</span>
                        <Badge variant="secondary" className="h-5 rounded px-1.5 py-0">
                          {group.changes.length}
                        </Badge>
                      </div>
                      <div className="space-y-1 px-1">
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
                  ))}
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
