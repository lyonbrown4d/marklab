import { FileText, Filter } from 'lucide-react'
import { useCallback, useDeferredValue, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/button'
import AppSearchField from '@/components/AppSearchField'
import { ScrollArea } from '@/components/AppScrollArea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/i18n/useI18n'
import { allPagesSortKeys, type AllPagesFilters, type AllPagesSortKey } from '@/logic/allPages'
import {
  hasAllPagesActiveFilters,
  parseAllPagesRouteState,
  resetAllPagesRouteFilters,
  updateAllPagesRouteState,
  type AllPagesRouteStatePatch,
} from '@/logic/allPagesRouteState'
import type { AllPagesViewMode } from '@/logic/allPagesViews'
import { builtInMarkdownCollections } from '@/logic/markdownCollections'
import { AllPagesActiveFilters } from '@/pages/all-pages/AllPagesActiveFilters'
import { AllPagesCollections } from '@/pages/all-pages/AllPagesCollections'
import { AllPagesResults } from '@/pages/all-pages/AllPagesResults'
import { AllPagesViewModeSelect } from '@/pages/all-pages/AllPagesViewModeSelect'
import { AllPagesIndexState } from '@/pages/all-pages/AllPagesIndexState'
import { useWorkspacePagesQuery } from '@/pages/all-pages/useWorkspacePagesQuery'
import { useLayoutContext } from '@/pages/useLayoutContext'

const collectionIds = builtInMarkdownCollections.map((collection) => collection.id)

const AllPagesPage = () => {
  const { t } = useI18n()
  const { onOpenFile, rootKind, rootPath } = useLayoutContext(
    useShallow((state) => ({
      onOpenFile: state.onOpenFile,
      rootKind: state.rootKind,
      rootPath: state.rootPath,
    })),
  )
  const [searchParams, setSearchParams] = useSearchParams()
  const routeState = useMemo(
    () => parseAllPagesRouteState(searchParams, collectionIds),
    [searchParams],
  )
  const { filters, viewMode } = routeState
  const deferredQuery = useDeferredValue(filters.query)
  const deferredFilters = useMemo<AllPagesFilters>(
    () => ({
      ...filters,
      query: deferredQuery,
    }),
    [deferredQuery, filters],
  )
  const hasActiveFilters = hasAllPagesActiveFilters(routeState)
  const activeCollectionId = routeState.collectionId
  const workspaceKey = `${rootKind}:${rootPath}`
  const query = useWorkspacePagesQuery({
    collectionId: activeCollectionId,
    filters: deferredFilters,
    workspaceKey,
  })
  const updateRouteState = useCallback(
    (patch: AllPagesRouteStatePatch) => {
      setSearchParams(updateAllPagesRouteState(searchParams, collectionIds, patch), {
        replace: true,
      })
    },
    [searchParams, setSearchParams],
  )
  const updateFilter = useCallback(
    <Key extends keyof AllPagesFilters>(key: Key, value: AllPagesFilters[Key]) => {
      updateRouteState({ filters: { [key]: value } as Partial<AllPagesFilters> })
    },
    [updateRouteState],
  )
  const selectCollection = useCallback(
    (collectionId: string) => {
      updateRouteState({ collectionId })
    },
    [updateRouteState],
  )
  const clearFilters = useCallback(() => {
    setSearchParams(resetAllPagesRouteFilters(searchParams, collectionIds), { replace: true })
  }, [searchParams, setSearchParams])
  const indexUnavailable = Boolean(query.error) && query.rows.length === 0

  return (
    <div className="h-full overflow-hidden bg-background text-foreground">
      <ScrollArea className="h-full" smoothWheel>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-5">
          <header className="flex min-w-0 items-center gap-2 border-b border-border/70 pb-3">
            <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-base font-semibold tracking-tight">{t('allPages.title')}</h1>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {query.rows.length} / {query.totalRows}
            </span>
          </header>

          <AllPagesIndexState
            error={query.error}
            loading={query.loading}
            onRetry={query.retry}
            t={t}
          />
          {!query.loading && !indexUnavailable ? (
            <>
              <AllPagesCollections
                activeCollectionId={activeCollectionId}
                collections={query.collections}
                onSelect={selectCollection}
                t={t}
              />

              <section
                aria-label={t('allPages.filters')}
                className="rounded-lg border border-border/70 bg-card/40 p-3"
              >
                <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px_150px_150px_auto]">
                  <AppSearchField
                    aria-label={t('allPages.searchPlaceholder')}
                    clearLabel={t('search.clear')}
                    placeholder={t('allPages.searchPlaceholder')}
                    value={filters.query}
                    onChange={(event) => updateFilter('query', event.target.value)}
                    onClear={() => updateFilter('query', '')}
                  />
                  <Select
                    value={filters.folder}
                    onValueChange={(value) => updateFilter('folder', value)}
                  >
                    <SelectTrigger aria-label={t('allPages.folderFilter')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">{t('allPages.allFolders')}</SelectItem>
                        {query.folders.map((folder) => (
                          <SelectItem key={folder} value={folder}>
                            {folder}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Select
                    value={filters.sort}
                    onValueChange={(value) => updateFilter('sort', value as AllPagesSortKey)}
                  >
                    <SelectTrigger aria-label={t('allPages.sort')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {allPagesSortKeys.map((sortKey) => (
                          <SelectItem key={sortKey} value={sortKey}>
                            {t(`allPages.sort.${sortKey}`)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <AllPagesViewModeSelect
                    value={viewMode}
                    onValueChange={(nextViewMode: AllPagesViewMode) =>
                      updateRouteState({ viewMode: nextViewMode })
                    }
                    t={t}
                  />
                  <Button
                    type="button"
                    variant={filters.issuesOnly ? 'secondary' : 'outline'}
                    className="justify-start rounded-md"
                    onClick={() => updateFilter('issuesOnly', !filters.issuesOnly)}
                  >
                    <Filter data-icon="inline-start" />
                    {t('allPages.issuesOnly')}
                  </Button>
                </div>
                <AllPagesActiveFilters
                  filters={filters}
                  hasActiveFilters={hasActiveFilters}
                  viewMode={viewMode}
                  onClear={clearFilters}
                  t={t}
                />
              </section>
              <AllPagesResults
                hasActiveFilters={hasActiveFilters}
                rows={query.rows}
                viewMode={viewMode}
                onClearFilters={clearFilters}
                onOpenFile={onOpenFile}
                t={t}
              />
            </>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

export default AllPagesPage
