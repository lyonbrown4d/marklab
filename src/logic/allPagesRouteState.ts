import {
  allPagesSortKeys,
  defaultAllPagesFilters,
  type AllPagesFilters,
  type AllPagesSortKey,
} from '@/logic/allPages'
import { allPagesViewModes, type AllPagesViewMode } from '@/logic/allPagesViews'

export type AllPagesRouteState = {
  collectionId: string
  filters: AllPagesFilters
  viewMode: AllPagesViewMode
}

export type AllPagesRouteStatePatch = {
  collectionId?: string
  filters?: Partial<AllPagesFilters>
  viewMode?: AllPagesViewMode
}

const defaultAllPagesRouteState: AllPagesRouteState = {
  collectionId: 'all',
  filters: defaultAllPagesFilters,
  viewMode: 'table',
}

export const parseAllPagesRouteState = (
  searchParams: URLSearchParams,
  collectionIds: readonly string[],
): AllPagesRouteState => {
  const collectionId = parseKnownValue(
    searchParams.get('collection'),
    collectionIds,
    defaultAllPagesRouteState.collectionId,
  )
  const sort = parseKnownValue(
    searchParams.get('sort'),
    allPagesSortKeys,
    defaultAllPagesFilters.sort,
  )
  const viewMode = parseKnownValue(
    searchParams.get('view'),
    allPagesViewModes,
    defaultAllPagesRouteState.viewMode,
  )

  return {
    collectionId,
    filters: {
      folder: normalizeTextParam(searchParams.get('folder'), defaultAllPagesFilters.folder),
      issuesOnly: searchParams.get('issues') === '1',
      query: normalizeTextParam(searchParams.get('q'), defaultAllPagesFilters.query),
      sort,
    },
    viewMode,
  }
}

export const buildAllPagesSearchParams = (state: AllPagesRouteState): URLSearchParams => {
  const params = new URLSearchParams()

  if (state.collectionId !== defaultAllPagesRouteState.collectionId) {
    params.set('collection', state.collectionId)
  }
  if (state.filters.query !== defaultAllPagesFilters.query) params.set('q', state.filters.query)
  if (state.filters.folder !== defaultAllPagesFilters.folder) {
    params.set('folder', state.filters.folder)
  }
  if (state.filters.sort !== defaultAllPagesFilters.sort) params.set('sort', state.filters.sort)
  if (state.filters.issuesOnly) params.set('issues', '1')
  if (state.viewMode !== defaultAllPagesRouteState.viewMode) params.set('view', state.viewMode)

  return params
}

export const updateAllPagesRouteState = (
  searchParams: URLSearchParams,
  collectionIds: readonly string[],
  patch: AllPagesRouteStatePatch,
): URLSearchParams => {
  const current = parseAllPagesRouteState(searchParams, collectionIds)
  return buildAllPagesSearchParams({
    ...current,
    ...patch,
    filters: {
      ...current.filters,
      ...patch.filters,
    },
  })
}

export const hasAllPagesActiveFilters = (state: AllPagesRouteState) =>
  state.filters.folder !== defaultAllPagesFilters.folder ||
  state.filters.issuesOnly !== defaultAllPagesFilters.issuesOnly ||
  state.filters.query !== defaultAllPagesFilters.query ||
  state.filters.sort !== defaultAllPagesFilters.sort ||
  state.viewMode !== defaultAllPagesRouteState.viewMode

export const resetAllPagesRouteFilters = (
  searchParams: URLSearchParams,
  collectionIds: readonly string[],
): URLSearchParams => {
  const current = parseAllPagesRouteState(searchParams, collectionIds)
  return buildAllPagesSearchParams({
    ...current,
    filters: defaultAllPagesFilters,
    viewMode: defaultAllPagesRouteState.viewMode,
  })
}

const parseKnownValue = <Value extends string>(
  value: string | null,
  values: readonly Value[],
  fallback: Value,
): Value => {
  if (!value) return fallback
  return values.includes(value as Value) ? (value as Value) : fallback
}

const normalizeTextParam = (value: string | null, fallback: string) => {
  if (value === null) return fallback
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

export type { AllPagesSortKey }
