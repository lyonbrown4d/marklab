import { FileText, Filter, ListFilter, Search } from 'lucide-react'
import { useCallback, useDeferredValue, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/i18n/useI18n'
import {
  allPagesSortKeys,
  buildAllPagesModelFromRows,
  buildAllPagesRows,
  type AllPagesFilters,
  type AllPagesSortKey,
} from '@/logic/allPages'
import {
  hasAllPagesActiveFilters,
  parseAllPagesRouteState,
  resetAllPagesRouteFilters,
  updateAllPagesRouteState,
  type AllPagesRouteStatePatch,
} from '@/logic/allPagesRouteState'
import type { AllPagesViewMode } from '@/logic/allPagesViews'
import {
  builtInMarkdownCollections,
  filterRowsByMarkdownCollection,
  summarizeMarkdownCollections,
} from '@/logic/markdownCollections'
import { AllPagesActiveFilters } from '@/pages/all-pages/AllPagesActiveFilters'
import { AllPagesCollections } from '@/pages/all-pages/AllPagesCollections'
import { AllPagesResults } from '@/pages/all-pages/AllPagesResults'
import { AllPagesViewModeSelect } from '@/pages/all-pages/AllPagesViewModeSelect'
import { useLayoutContext } from '@/pages/useLayoutContext'

const formatter = new Intl.NumberFormat()

const count = (value: number) => formatter.format(value)

const collectionIds = builtInMarkdownCollections.map((collection) => collection.id)

const AllPagesPage = () => {
  const { t } = useI18n()
  const { files, onOpenFile, workspaceIndex } = useLayoutContext()
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
  const allRows = useMemo(() => buildAllPagesRows(files, workspaceIndex), [files, workspaceIndex])
  const collectionSummaries = useMemo(
    () => summarizeMarkdownCollections(allRows, builtInMarkdownCollections),
    [allRows],
  )
  const baseModel = useMemo(
    () => buildAllPagesModelFromRows(allRows, deferredFilters),
    [allRows, deferredFilters],
  )
  const activeCollection = useMemo(
    () =>
      builtInMarkdownCollections.find((collection) => collection.id === activeCollectionId) ??
      builtInMarkdownCollections[0],
    [activeCollectionId],
  )
  const model = useMemo(
    () => ({
      ...baseModel,
      rows: activeCollection
        ? filterRowsByMarkdownCollection(baseModel.rows, activeCollection)
        : baseModel.rows,
    }),
    [activeCollection, baseModel],
  )
  const indexed = Boolean(workspaceIndex)
  const issueCount = useMemo(
    () => model.rows.reduce((total, row) => total + row.issues, 0),
    [model.rows],
  )

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

  return (
    <div className="h-full overflow-hidden bg-background text-foreground">
      <ScrollArea className="h-full" smoothWheel>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6">
          <Card className="gap-0 py-0">
            <CardContent className="p-5 md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    <FileText className="size-4" aria-hidden="true" />
                    {t('allPages.eyebrow')}
                  </div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                    {t('allPages.title')}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {t('allPages.description')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={indexed ? 'secondary' : 'outline'}
                    className="h-8 rounded-md px-3"
                  >
                    {indexed ? t('allPages.indexReady') : t('allPages.indexPending')}
                  </Badge>
                  <Badge variant="outline" className="h-8 rounded-md px-3">
                    {count(model.rows.length)} / {count(model.totalRows)}
                  </Badge>
                  {issueCount > 0 ? (
                    <Badge
                      variant="outline"
                      className="h-8 rounded-md border-destructive/40 px-3 text-destructive"
                    >
                      {t('allPages.issueCount', { count: count(issueCount) })}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <AllPagesCollections
            activeCollectionId={activeCollectionId}
            collections={collectionSummaries}
            onSelect={selectCollection}
            t={t}
          />

          <Card className="gap-0 py-0">
            <CardHeader className="p-4 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ListFilter className="size-4" aria-hidden="true" />
                {t('allPages.filters')}
              </CardTitle>
              <CardDescription>{t('allPages.filtersDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 pt-0 md:grid-cols-[minmax(220px,1fr)_180px_150px_150px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label={t('allPages.searchPlaceholder')}
                  className="pl-8"
                  placeholder={t('allPages.searchPlaceholder')}
                  value={filters.query}
                  onChange={(event) => updateFilter('query', event.target.value)}
                />
              </div>
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
                    {model.folders.map((folder) => (
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
            </CardContent>
            <AllPagesActiveFilters
              filters={filters}
              hasActiveFilters={hasActiveFilters}
              viewMode={viewMode}
              onClear={clearFilters}
              t={t}
            />
          </Card>
          <AllPagesResults
            hasActiveFilters={hasActiveFilters}
            rows={model.rows}
            viewMode={viewMode}
            onClearFilters={clearFilters}
            onOpenFile={onOpenFile}
            t={t}
          />
        </div>
      </ScrollArea>
    </div>
  )
}

export default AllPagesPage
