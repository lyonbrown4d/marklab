import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n/useI18n'
import { gitApiForWorkspace } from '@/services/gitApi'
import type { GitCommitSummary } from '@/types/gitOperations'
import type { GitManagementActions } from '@/features/git/management/useGitManagement'
import { GitQueryState } from '@/components/git/GitQueryState'
import { GitCommitDetails } from '@/components/git/GitCommitDetails'
import { GitCommitActionDialog, type GitCommitAction } from '@/components/git/GitCommitActionDialog'
import { useGitRefreshOptions } from '@/features/git/useGitRefreshOptions'

export const GitHistoryTab = (props: GitManagementActions) => {
  const { rootPath, disabled } = props
  const { t } = useI18n()
  const api = useMemo(() => gitApiForWorkspace(rootPath), [rootPath])
  const [selected, setSelected] = useState<GitCommitSummary | null>(null)
  const [action, setAction] = useState<GitCommitAction | null>(null)
  const [backup, setBackup] = useState<string | null>(null)
  const refresh = useGitRefreshOptions(rootPath)
  const query = useInfiniteQuery({
    ...refresh,
    queryKey: ['git-history', rootPath],
    queryFn: ({ pageParam }) => api.getHistory({ limit: 50, skip: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.length === 50 ? lastPageParam + 50 : undefined,
  })
  const commits = query.data?.pages.flat() ?? []
  const commit = selected ?? commits[0]
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {backup && (
        <p role="status" className="shrink-0 break-all text-xs">
          {t('scm.reset.backupCreated', { branch: backup })}
        </p>
      )}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,2fr)] gap-3 md:grid-cols-[minmax(220px,2fr)_minmax(0,3fr)] md:grid-rows-1">
        <section className="min-h-0 overflow-auto" aria-label={t('scm.history.title')}>
          <GitQueryState
            loading={query.isLoading}
            error={query.error}
            empty={!query.isLoading && !query.isError && commits.length === 0}
            onRetry={() => {
              void query.refetch()
            }}
          />
          <ul className="divide-y divide-border">
            {commits.map((item) => (
              <li key={item.hash} className="flex items-center gap-1 py-1">
                <Button
                  variant={item.hash === commit?.hash ? 'secondary' : 'ghost'}
                  aria-pressed={item.hash === commit?.hash}
                  className="h-auto min-w-0 flex-1 flex-col items-start gap-1 px-2 py-2 text-left"
                  onClick={() => setSelected(item)}
                >
                  <span className="w-full truncate text-xs">{item.subject}</span>
                  <span className="w-full truncate text-[11px] font-normal text-muted-foreground">
                    {item.shortHash} · {item.author} · {item.date}
                  </span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      disabled={disabled}
                      aria-label={t('scm.history.actions', { commit: item.shortHash })}
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(['revert', 'cherryPick', 'reset'] as const).map((type) => (
                      <DropdownMenuItem
                        key={type}
                        disabled={disabled}
                        onSelect={() => setAction({ type, commit: item })}
                      >
                        {t(type === 'reset' ? 'scm.reset.title' : `scm.history.${type}`)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
          {query.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetchingNextPage}
              onClick={() => {
                void query.fetchNextPage()
              }}
            >
              {query.isFetchingNextPage ? t('scm.management.loading') : t('scm.history.loadMore')}
            </Button>
          )}
        </section>
        {commit && <GitCommitDetails key={commit.hash} rootPath={rootPath} commit={commit} />}
      </div>
      {action && (
        <GitCommitActionDialog
          key={`${action.type}:${action.commit.hash}`}
          {...props}
          action={action}
          onClose={() => setAction(null)}
          onBackup={setBackup}
        />
      )}
    </div>
  )
}
