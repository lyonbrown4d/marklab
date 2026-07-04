import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useDebounce } from 'ahooks'
import { Search } from 'lucide-react'
import AppButton from '@/components/AppButton'
import AppEmptyState from '@/components/AppEmptyState'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { fsApi, type FsSearchResult } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import { useI18n } from '@/i18n/useI18n'
import SearchResultPreview from '@/components/SearchResultPreview'

type FullTextSearchPanelProps = {
  query: string
  onOpenResult: (result: FsSearchResult) => void
}

const SEARCH_LOADING_SKELETONS = ['h-12 w-full', 'h-12 w-11/12', 'h-12 w-full'] as const

const FullTextSearchLoading = ({ label }: { label: string }) => (
  <div aria-busy="true" aria-label={label} className="flex flex-col gap-2 p-1" role="status">
    {SEARCH_LOADING_SKELETONS.map((className, index) => (
      <Skeleton
        key={`${className}:${index}`}
        aria-hidden="true"
        className={className}
        data-slot="full-text-search-skeleton"
      />
    ))}
  </div>
)

const FullTextSearchPanel = ({ query, onOpenResult }: FullTextSearchPanelProps) => {
  const { t } = useI18n()
  const debouncedQuery = useDebounce(query.trim(), { wait: 180 })
  const enabled = isDesktopRuntime() && debouncedQuery.length >= 2
  const searchQuery = useQuery({
    queryKey: ['workspace-search', debouncedQuery],
    queryFn: () => fsApi.searchWorkspace(debouncedQuery, 20),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  })

  if (query.trim().length < 2) {
    return (
      <AppEmptyState
        compact
        className="border-sidebar-border bg-sidebar-accent/20"
        icon={<Search className="size-4" />}
        title={t('search.minQuery')}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex h-6 items-center justify-between px-1 text-[11px] uppercase text-muted-foreground">
        <span>{t('search.fullText')}</span>
        {searchQuery.isFetching ? (
          <Spinner aria-hidden="true" className="size-3.5" role="presentation" />
        ) : searchQuery.data?.length ? (
          <Badge variant="outline" className="h-5 rounded px-1.5 py-0 text-[10px]">
            {searchQuery.data.length}
          </Badge>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full pr-1">
        {searchQuery.isFetching && !searchQuery.data?.length ? (
          <FullTextSearchLoading label={t('search.searching')} />
        ) : searchQuery.data?.length ? (
          <div className="flex flex-col gap-1">
            {searchQuery.data.map((result) => (
              <AppButton
                key={`${result.path}:${result.line}:${result.column}`}
                variant="ghost"
                size="sm"
                className="h-auto min-h-12 w-full items-start justify-start rounded-md px-2 py-1.5 text-left"
                onClick={() => onOpenResult(result)}
              >
                <SearchResultPreview result={result} />
              </AppButton>
            ))}
          </div>
        ) : (
          <AppEmptyState
            compact
            className="border-sidebar-border bg-sidebar-accent/20"
            title={searchQuery.isFetching ? t('search.searching') : t('search.noResults')}
          />
        )}
      </ScrollArea>
    </div>
  )
}

export default FullTextSearchPanel
