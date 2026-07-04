import { GitBranch, GitCommitHorizontal, RefreshCw } from 'lucide-react'
import AppAlert from '@/components/AppAlert'
import AppEmptyState from '@/components/AppEmptyState'
import { ScmChangeGroups, type ScmChangeGroup } from '@/components/ScmChangeGroups'
import { GitRepositoryEmptyState } from '@/components/GitRepositoryEmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import type { GitDiffRequest } from '@/services/gitApi'

type ScmCollapsedButtonProps = {
  busy?: boolean
  disabled?: boolean
  label: string
  onClick?: () => void
  variant?: 'ghost' | 'secondary'
}

export const ScmCollapsedButton = ({
  busy,
  disabled,
  label,
  onClick,
  variant = 'ghost',
}: ScmCollapsedButtonProps) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size="icon"
          className="size-8 rounded-md"
          aria-busy={busy}
          aria-label={label}
          title={label}
          disabled={disabled}
          onClick={onClick}
        >
          <GitBranch aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

type ScmSingleFilePanelProps = {
  description: string
  regionLabel: string
  title: string
}

export const ScmSingleFilePanel = ({
  description,
  regionLabel,
  title,
}: ScmSingleFilePanelProps) => (
  <SidebarGroup aria-label={regionLabel} role="region" className="sidebar-section rounded-md p-1">
    <SidebarGroupLabel className="sidebar-section-header flex h-7 items-center justify-between px-2 text-[11px] uppercase">
      <span>{regionLabel}</span>
    </SidebarGroupLabel>
    <SidebarGroupContent>
      <AppEmptyState
        compact
        className="mx-2 mb-2 min-h-32 flex-none border-sidebar-border/80 bg-sidebar/40 px-4 py-5"
        description={description}
        descriptionClassName="max-w-[13rem] text-[11px] leading-4"
        icon={<GitBranch aria-hidden="true" />}
        mediaClassName="mb-1 border border-sidebar-border bg-background/70 text-muted-foreground"
        title={title}
        titleClassName="text-xs"
        titleLevel={3}
      />
    </SidebarGroupContent>
  </SidebarGroup>
)

const ScmStatusLoading = ({ label }: { label: string }) => (
  <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-2 px-2 pb-2">
    <Skeleton aria-hidden="true" className="h-8 w-full" />
    <Skeleton aria-hidden="true" className="h-8 w-10/12" />
    <Skeleton aria-hidden="true" className="h-8 w-full" />
  </div>
)

type ScmRepositoryPanelProps = {
  branch: string
  commitDisabledReason?: string
  commitDisabledReasonId: string
  groups: ScmChangeGroup[]
  hasConflicts: boolean
  initError: unknown
  isCommitting: boolean
  isInitializing: boolean
  isRepository: boolean
  isStatusError: boolean
  isStatusFetching: boolean
  isStatusLoading: boolean
  onOpenCommitDialog: () => void
  onOpenDiff: (request: GitDiffRequest) => void
  onOpenInitDialog: () => void
  onRefresh: () => void
  statusError: unknown
  totalChanges: number
}

export const ScmRepositoryPanel = ({
  branch,
  commitDisabledReason,
  commitDisabledReasonId,
  groups,
  hasConflicts,
  initError,
  isCommitting,
  isInitializing,
  isRepository,
  isStatusError,
  isStatusFetching,
  isStatusLoading,
  onOpenCommitDialog,
  onOpenDiff,
  onOpenInitDialog,
  onRefresh,
  statusError,
  totalChanges,
}: ScmRepositoryPanelProps) => {
  const { t } = useI18n()

  return (
    <SidebarGroup
      aria-label={t('scm.title')}
      role="region"
      className="sidebar-section rounded-md p-1"
    >
      <SidebarGroupLabel className="sidebar-section-header flex h-7 items-center justify-between px-2 text-[11px] uppercase">
        <span>{t('scm.title')}</span>
        <div className="flex items-center gap-1">
          {isRepository && (
            <Badge variant="secondary" className="rounded px-1.5 py-0">
              {t('scm.changedFiles', { count: String(totalChanges) })}
            </Badge>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 rounded-md"
            aria-busy={isStatusFetching}
            aria-label={t('scm.refresh')}
            title={t('scm.refresh')}
            onClick={onRefresh}
            disabled={isStatusFetching}
          >
            {isStatusFetching ? (
              <Spinner aria-hidden="true" role="presentation" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
          </Button>
        </div>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        {isStatusError ? (
          <div className="px-2 py-1 text-xs">
            <AppAlert
              role="alert"
              tone="destructive"
              title={t('scm.statusError')}
              className="px-2 py-1.5 text-xs"
            >
              {String(statusError)}
            </AppAlert>
          </div>
        ) : isStatusLoading ? (
          <ScmStatusLoading label={t('scm.loading')} />
        ) : !isRepository ? (
          <GitRepositoryEmptyState
            isInitializing={isInitializing}
            initError={initError}
            onOpenInitDialog={onOpenInitDialog}
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
                  disabled={isCommitting || hasConflicts}
                  title={commitDisabledReason ?? t('scm.commitAll')}
                  onClick={onOpenCommitDialog}
                >
                  {isCommitting ? (
                    <Spinner aria-hidden="true" role="presentation" data-icon="inline-start" />
                  ) : (
                    <GitCommitHorizontal data-icon="inline-start" />
                  )}
                  {isCommitting ? t('scm.committing') : t('scm.openCommitDialog')}
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
              <ScmChangeGroups groups={groups} onOpenDiff={onOpenDiff} />
            )}
          </div>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
