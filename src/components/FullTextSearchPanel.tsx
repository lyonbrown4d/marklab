import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AlertCircle, ChevronsDownUp, ChevronsUpDown, Search, SearchX, X } from 'lucide-react'
import AppButton from '@/components/AppButton'
import AppEmptyState from '@/components/AppEmptyState'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/AppScrollArea'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/i18n/useI18n'
import type { FsSearchResult } from '@/services/fsApi'
import SearchResultGroups from '@/components/sidebar-search/SearchResultGroups'
import type { WorkspaceSearchOptions } from '@/components/sidebar-search/searchModel'
import { useWorkspaceSearch } from '@/components/sidebar-search/useWorkspaceSearch'

export type FullTextSearchPanelHandle = {
  handleKeyDown: (key: string) => boolean
}

type FullTextSearchPanelProps = {
  onOpenResult: (result: FsSearchResult) => void
  onRequestSearchFocus?: () => void
  options: WorkspaceSearchOptions
  query: string
  workspaceKey: string
}

const SEARCH_LOADING_SKELETONS = ['h-14 w-full', 'h-14 w-11/12', 'h-14 w-full'] as const

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

const SearchFooter = () => {
  const { t } = useI18n()
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-sidebar-border/70 px-1 text-[10px] text-muted-foreground">
      <span>{t('search.footer.navigate')}</span>
      <span>{t('search.footer.open')}</span>
      <span>{t('search.footer.collapse')}</span>
    </div>
  )
}

const FullTextSearchPanel = forwardRef<FullTextSearchPanelHandle, FullTextSearchPanelProps>(
  ({ query, workspaceKey, options, onOpenResult, onRequestSearchFocus }, ref) => {
    const { t } = useI18n()
    const search = useWorkspaceSearch({ options, query, workspaceKey })
    const { groups } = search.view
    const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set())
    const [selectedIdState, setSelectedId] = useState<string | null>(null)
    const [cancelledSignature, setCancelledSignature] = useState<string | null>(null)
    const resultsListRef = useRef<HTMLDivElement>(null)
    const cancelled = cancelledSignature === search.signature
    const visibleMatches = useMemo(
      () => groups.flatMap((group) => (collapsedPaths.has(group.path) ? [] : group.matches)),
      [collapsedPaths, groups],
    )
    const selectedId = visibleMatches.some((match) => match.id === selectedIdState)
      ? selectedIdState
      : (visibleMatches[0]?.id ?? null)

    useEffect(() => {
      const selected = resultsListRef.current?.querySelector('[aria-current="true"]')
      selected?.scrollIntoView?.({ block: 'nearest' })
    }, [selectedId])

    const focusMatch = useCallback((id: string) => {
      const buttons =
        resultsListRef.current?.querySelectorAll<HTMLButtonElement>('[data-search-result-id]')
      const match = Array.from(buttons ?? []).find((button) => button.dataset.searchResultId === id)
      match?.focus()
    }, [])

    const handleKeyDown = useCallback(
      (key: string): boolean => {
        if (key === 'Escape' && groups.length > 0) {
          onRequestSearchFocus?.()
          setCollapsedPaths(new Set(groups.map((group) => group.path)))
          return true
        }
        if (visibleMatches.length === 0) return false
        const activeId =
          document.activeElement instanceof HTMLElement
            ? document.activeElement.dataset.searchResultId
            : undefined
        const activeIndex = visibleMatches.findIndex((match) => match.id === activeId)
        const selectedIndex = visibleMatches.findIndex((match) => match.id === selectedId)
        const index = activeIndex >= 0 ? activeIndex : Math.max(0, selectedIndex)
        if (key === 'ArrowDown' || key === 'ArrowUp') {
          const offset = key === 'ArrowDown' ? 1 : -1
          const nextIndex =
            activeIndex < 0
              ? key === 'ArrowDown'
                ? 0
                : visibleMatches.length - 1
              : Math.min(Math.max(index + offset, 0), visibleMatches.length - 1)
          const nextId = visibleMatches[nextIndex]?.id
          if (nextId) {
            setSelectedId(nextId)
            focusMatch(nextId)
          }
          return true
        }
        if (key === 'Enter') {
          const selected = visibleMatches[index]
          if (selected) onOpenResult(selected.result)
          return Boolean(selected)
        }
        return false
      },
      [focusMatch, groups, onOpenResult, onRequestSearchFocus, selectedId, visibleMatches],
    )
    useImperativeHandle(ref, () => ({ handleKeyDown }), [handleKeyDown])

    const toggleGroup = (path: string) => {
      setCollapsedPaths((current) => {
        const next = new Set(current)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return next
      })
    }
    const cancelSearch = () => {
      setCancelledSignature(search.signature)
      void search.cancel()
    }
    const retrySearch = () => {
      setCancelledSignature(null)
      void search.refetch()
    }

    if (search.isTooShort) {
      return (
        <AppEmptyState
          compact
          className="border-sidebar-border bg-sidebar-accent/20"
          icon={<Search className="size-4" />}
          title={t('search.minQuery')}
        />
      )
    }
    if (search.immediateIssue) {
      return (
        <AppEmptyState
          compact
          role="alert"
          className="border-destructive/30 bg-destructive/5"
          icon={<AlertCircle className="size-4" />}
          title={t(`search.${search.immediateIssue}`)}
        />
      )
    }

    const initiallyLoading =
      search.isDebouncing || (search.searchQuery.isFetching && !search.searchQuery.data)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-7 shrink-0 items-center gap-1 px-1 text-[11px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {search.view.totalMatches > 0
              ? t('search.resultSummary', {
                  files: search.view.totalFiles,
                  matches: search.view.totalMatches,
                })
              : t('search.fullText')}
          </span>
          {search.searchQuery.isFetching ? <Spinner aria-hidden="true" className="size-3" /> : null}
          {search.searchQuery.isFetching ? (
            <Button
              aria-label={t('search.cancel')}
              className="size-6"
              onClick={cancelSearch}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X />
            </Button>
          ) : null}
          {groups.length > 0 ? (
            <>
              <Button
                aria-label={t('search.expandAll')}
                className="size-6"
                onClick={() => setCollapsedPaths(new Set())}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ChevronsUpDown />
              </Button>
              <Button
                aria-label={t('search.collapseAll')}
                className="size-6"
                onClick={() => setCollapsedPaths(new Set(groups.map((group) => group.path)))}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ChevronsDownUp />
              </Button>
            </>
          ) : null}
        </div>
        {search.searchQuery.data?.truncated ? (
          <p className="px-1 pb-1 text-[10px] leading-4 text-muted-foreground">
            {t('search.truncated', {
              count: search.searchQuery.data.results.length,
              total: search.searchQuery.data.totalHits,
            })}
          </p>
        ) : null}
        <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full pr-1">
          {cancelled ? (
            <AppEmptyState
              compact
              role="status"
              icon={<SearchX className="size-4" />}
              title={t('search.canceled')}
              action={
                <AppButton size="sm" variant="outline" onClick={retrySearch}>
                  {t('actions.retry')}
                </AppButton>
              }
            />
          ) : search.searchQuery.isError ? (
            <AppEmptyState
              compact
              role="alert"
              className="border-destructive/30 bg-destructive/5"
              icon={<AlertCircle className="size-4" />}
              title={t('search.failed')}
              action={
                <AppButton size="sm" variant="outline" onClick={retrySearch}>
                  {t('actions.retry')}
                </AppButton>
              }
            />
          ) : initiallyLoading ? (
            <FullTextSearchLoading label={t('search.searching')} />
          ) : groups.length > 0 ? (
            <div ref={resultsListRef}>
              <SearchResultGroups
                collapsedPaths={collapsedPaths}
                groups={groups}
                lineLabel={(line) => t('search.line', { line })}
                matchesLabel={(count) => t('search.matches', { count })}
                noSnippetLabel={t('search.noSnippet')}
                onKeyDown={handleKeyDown}
                onOpen={(match) => onOpenResult(match.result)}
                onSelect={setSelectedId}
                onToggleGroup={toggleGroup}
                selectedId={selectedId}
              />
            </div>
          ) : (
            <AppEmptyState compact title={t('search.noResults')} />
          )}
        </ScrollArea>
        <SearchFooter />
      </div>
    )
  },
)

FullTextSearchPanel.displayName = 'FullTextSearchPanel'

export default FullTextSearchPanel
