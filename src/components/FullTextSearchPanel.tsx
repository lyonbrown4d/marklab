import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useDebounce } from 'ahooks'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fsApi, type FsSearchResult } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import { useI18n } from '@/i18n/useI18n'
import SearchResultPreview from '@/components/SearchResultPreview'

type FullTextSearchPanelProps = {
  query: string
  onOpenResult: (result: FsSearchResult) => void
}

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
      <div className="rounded-md border border-dashed border-sidebar-border px-2 py-3 text-xs text-muted-foreground">
        {t('search.minQuery')}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex h-6 items-center justify-between px-1 text-[11px] uppercase text-muted-foreground">
        <span>{t('search.fullText')}</span>
        {searchQuery.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </div>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full pr-1">
        {searchQuery.data?.length ? (
          <div className="flex flex-col gap-1">
            {searchQuery.data.map((result) => (
              <Button
                key={`${result.path}:${result.line}:${result.column}`}
                variant="ghost"
                size="sm"
                className="h-auto min-h-12 w-full items-start justify-start rounded-md px-2 py-1.5 text-left"
                onClick={() => onOpenResult(result)}
              >
                <SearchResultPreview result={result} />
              </Button>
            ))}
          </div>
        ) : (
          <div className="px-1 py-2 text-xs text-muted-foreground">
            {searchQuery.isFetching ? t('search.searching') : t('search.noResults')}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

export default FullTextSearchPanel
