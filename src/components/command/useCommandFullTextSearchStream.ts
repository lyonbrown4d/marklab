import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useDebounce } from 'ahooks'
import { fsApi, type FsSearchResult } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import type { CommandSearchScope } from '@/components/command/commandSearchScope'

type CommandFullTextSearchInput = {
  limit: number
  open: boolean
  query: string
  scope: CommandSearchScope
}

type CommandFullTextSearchState = {
  fullTextError: boolean
  fullTextFetching: boolean
  fullTextResults: FsSearchResult[]
}

const COMMAND_FULL_TEXT_DEBOUNCE_MS = 160
const MIN_FULL_TEXT_QUERY_LENGTH = 2

const canSearchFullText = ({ open, query, scope }: CommandFullTextSearchInput) => {
  return (
    open &&
    isDesktopRuntime() &&
    query.length >= MIN_FULL_TEXT_QUERY_LENGTH &&
    (scope === 'all' || scope === 'text')
  )
}

export const useCommandFullTextSearchStream = (
  input: CommandFullTextSearchInput,
): CommandFullTextSearchState => {
  const query = input.query.trim()
  const debouncedQuery = useDebounce(query, { wait: COMMAND_FULL_TEXT_DEBOUNCE_MS })
  const searchable = canSearchFullText({ ...input, query })
  const searchQuery = useQuery({
    queryKey: ['command-workspace-search', debouncedQuery, input.limit],
    queryFn: () => fsApi.searchWorkspace(debouncedQuery, input.limit),
    enabled: canSearchFullText({ ...input, query: debouncedQuery }),
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 5_000,
  })
  const stale = debouncedQuery !== query || searchQuery.isPlaceholderData

  return {
    fullTextError: searchable && !stale && searchQuery.isError,
    fullTextFetching: searchable && (stale || searchQuery.isFetching),
    fullTextResults: searchable && !stale ? (searchQuery.data ?? []) : [],
  }
}
