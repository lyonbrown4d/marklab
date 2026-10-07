import { useEffect, useMemo } from 'react'
import { useDebounce } from 'ahooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import {
  buildSearchView,
  validateSearchQuery,
  type WorkspaceSearchOptions,
} from '@/components/sidebar-search/searchModel'

const SEARCH_CANDIDATE_LIMIT = 100
let requestSequence = 0

const createRequestId = (): string => {
  requestSequence += 1
  return `workspace-search-${Date.now()}-${requestSequence}`
}

export const useWorkspaceSearch = ({
  options,
  query,
  workspaceKey,
}: {
  options: WorkspaceSearchOptions
  query: string
  workspaceKey: string
}) => {
  const queryClient = useQueryClient()
  const trimmedQuery = query.trim()
  const debouncedQuery = useDebounce(trimmedQuery, { wait: 180 })
  const immediateIssue = useMemo(
    () => validateSearchQuery(trimmedQuery, options),
    [options, trimmedQuery],
  )
  const debouncedIssue = useMemo(
    () => validateSearchQuery(debouncedQuery, options),
    [debouncedQuery, options],
  )
  const queryKey = useMemo(
    () => [
      'workspace-occurrence-search',
      workspaceKey,
      debouncedQuery,
      options.caseSensitive,
      options.wholeWord,
      options.useRegex,
    ],
    [debouncedQuery, options, workspaceKey],
  )
  const enabled = isDesktopRuntime() && debouncedQuery.length >= 2 && debouncedIssue === null
  const searchQuery = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const requestId = createRequestId()
      let cancelSent = false
      const cancelBackend = () => {
        if (cancelSent) return
        cancelSent = true
        void fsApi.cancelWorkspaceOccurrenceSearch(requestId)
      }
      signal.addEventListener('abort', cancelBackend, { once: true })
      try {
        const response = await fsApi.searchWorkspaceOccurrences({
          limit: SEARCH_CANDIDATE_LIMIT,
          options,
          query: debouncedQuery,
          requestId,
        })
        if (signal.aborted) throw new DOMException('Search canceled', 'AbortError')
        return response
      } finally {
        signal.removeEventListener('abort', cancelBackend)
      }
    },
    enabled,
    retry: false,
    staleTime: 5_000,
  })
  useEffect(
    () => () => {
      void queryClient.cancelQueries({ exact: true, queryKey })
    },
    [queryClient, queryKey, trimmedQuery],
  )
  const view = useMemo(
    () => buildSearchView(searchQuery.data?.results ?? [], searchQuery.data?.totalHits),
    [searchQuery.data],
  )
  const signature = `${workspaceKey}\0${trimmedQuery}\0${options.caseSensitive}\0${options.wholeWord}\0${options.useRegex}`

  return {
    cancel: () => queryClient.cancelQueries({ exact: true, queryKey }),
    candidateLimit: SEARCH_CANDIDATE_LIMIT,
    immediateIssue,
    isDebouncing: trimmedQuery !== debouncedQuery && trimmedQuery.length >= 2,
    isTooShort: trimmedQuery.length < 2,
    refetch: searchQuery.refetch,
    searchQuery,
    signature,
    view,
  }
}
