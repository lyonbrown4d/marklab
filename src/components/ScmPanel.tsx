import { useCallback, useEffect, useMemo, useState } from 'react'
import { GitBranch, GitCommitHorizontal, Plus, RefreshCw } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import debounce from 'lodash-es/debounce'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
  id: string
  label: string
  changes: GitFileChange[]
}

const statusLabels: Record<GitFileChange['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  conflicted: '!',
  untracked: 'U',
  ignored: 'I',
  tracked: 'T',
  pruned: '-',
}

const ChangeRow = ({
  change,
  section,
  onOpenDiff,
}: {
  change: GitFileChange
  section: GitDiffRequest['section']
  onOpenDiff: (request: GitDiffRequest) => void
}) => {
  return (
    <button
      type="button"
      className="flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs text-sidebar-foreground/85 hover:bg-sidebar-accent"
      onClick={() => onOpenDiff({ path: change.path, status: change.status, section })}
    >
      <Badge variant="secondary" className="h-4 min-w-4 rounded px-1 text-[10px]">
        {statusLabels[change.status]}
      </Badge>
      <span className="min-w-0 flex-1 truncate">{change.path}</span>
    </button>
  )
}

const ScmPanel = ({ rootPath, rootKind, collapsed, onOpenDiff }: ScmPanelProps) => {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [commitMessage, setCommitMessage] = useState('')
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
    onSuccess: invalidateStatus,
  })

  const commitMutation = useMutation({
    mutationFn: async () => {
      await fsApi.flushBuffers()
      return gitApi.commitAll(rootPath, commitMessage.trim())
    },
    onSuccess: (snapshot) => {
      setCommitMessage('')
      queryClient.setQueryData(queryKey, snapshot)
      invalidateStatus()
    },
  })

  const groups = useMemo<ChangeGroup[]>(() => {
    const snapshot = statusQuery.data
    if (!snapshot?.repo.is_repository) return []
    return [
      { id: 'conflicts', label: t('scm.conflicts'), changes: snapshot.conflicts },
      { id: 'staged', label: t('scm.staged'), changes: snapshot.staged },
      { id: 'unstaged', label: t('scm.changes'), changes: snapshot.unstaged },
      { id: 'untracked', label: t('scm.untracked'), changes: snapshot.untracked },
    ].filter((group) => group.changes.length > 0)
  }, [statusQuery.data, t])

  if (!enabled) return null

  const totalChanges = countChangedFiles(statusQuery.data)
  const branch = statusQuery.data?.repo.branch ?? t('scm.noBranch')
  const canCommit =
    totalChanges > 0 &&
    !statusQuery.data?.conflicts.length &&
    commitMessage.trim().length > 0 &&
    !commitMutation.isPending

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
            <RefreshCw className={`h-3.5 w-3.5 ${statusQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        {statusQuery.isError ? (
          <div className="px-2 py-1 text-xs text-destructive">{String(statusQuery.error)}</div>
        ) : statusQuery.isLoading ? (
          <div className="px-2 pb-1 text-xs text-muted-foreground">{t('scm.loading')}</div>
        ) : !statusQuery.data?.repo.is_repository ? (
          <div className="space-y-2 px-2 pb-2 text-xs">
            <div className="text-muted-foreground">{t('scm.notRepository')}</div>
            <Button
              variant="secondary"
              size="sm"
              className="h-7 w-full justify-start rounded-md px-2 text-xs"
              disabled={initMutation.isPending}
              onClick={() => {
                if (!window.confirm(t('scm.initConfirm'))) return
                initMutation.mutate()
              }}
            >
              <Plus className="h-4 w-4" />
              {initMutation.isPending ? t('scm.initializing') : t('scm.init')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex min-w-0 items-center gap-2 px-2 text-xs text-muted-foreground">
              <GitCommitHorizontal className="h-4 w-4 shrink-0" />
              <span className="truncate">{branch}</span>
              <span className="ml-auto shrink-0">
                {t('scm.changedFiles', { count: String(totalChanges) })}
              </span>
            </div>
            <Separator className="bg-sidebar-border/70" />
            {totalChanges > 0 && (
              <form
                className="space-y-1.5 px-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!canCommit) return
                  commitMutation.mutate()
                }}
              >
                <Input
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  placeholder={t('scm.commitPlaceholder')}
                  aria-label={t('scm.commitMessage')}
                  className="h-7 rounded-md border-sidebar-border bg-background/70 text-xs shadow-sm"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  className="h-7 w-full justify-start rounded-md px-2 text-xs"
                  disabled={!canCommit}
                  title={t('scm.commitAll')}
                >
                  <GitCommitHorizontal className="h-4 w-4" />
                  {commitMutation.isPending ? t('scm.committing') : t('scm.commit')}
                </Button>
                {commitMutation.isError && (
                  <div className="text-xs text-destructive">{String(commitMutation.error)}</div>
                )}
              </form>
            )}
            {groups.length === 0 ? (
              <div className="px-2 pb-1 text-xs text-muted-foreground">{t('scm.clean')}</div>
            ) : (
              <SidebarMenu>
                {groups.map((group) => (
                  <SidebarMenuItem key={group.id} className="space-y-1">
                    <div className="flex h-6 items-center justify-between px-2 text-[11px] font-medium uppercase text-muted-foreground">
                      <span>{group.label}</span>
                      <span>{group.changes.length}</span>
                    </div>
                    <div className="space-y-0.5">
                      {group.changes.slice(0, 8).map((change) => (
                        <ChangeRow
                          key={`${group.id}:${change.path}:${change.status}`}
                          change={change}
                          section={group.id as GitDiffRequest['section']}
                          onOpenDiff={onOpenDiff}
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
  )
}

export default ScmPanel
