import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import type { BacklinkReference } from '@/logic/backlinks'
import { buildUnlinkedMentions } from '@/logic/unlinkedMentions'

const MENTION_LIMIT = 100
let requestSequence = 0

const createRequestId = () => `unlinked-mentions-${Date.now()}-${++requestSequence}`

export const useUnlinkedMentions = ({
  backlinks,
  enabled,
  targetLabel,
  targetPath,
  workspaceKey,
}: {
  backlinks: BacklinkReference[]
  enabled: boolean
  targetLabel: string
  targetPath: string | null
  workspaceKey: string
}) => {
  const queryClient = useQueryClient()
  const query = targetLabel.trim()
  const queryKey = useMemo(
    () => ['unlinked-mentions', workspaceKey, targetPath, query],
    [query, targetPath, workspaceKey],
  )
  const search = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const requestId = createRequestId()
      const cancel = () => void fsApi.cancelWorkspaceOccurrenceSearch(requestId)
      signal.addEventListener('abort', cancel, { once: true })
      try {
        const result = await fsApi.searchWorkspaceOccurrences({
          requestId,
          query,
          limit: MENTION_LIMIT,
          options: { caseSensitive: false, wholeWord: true, useRegex: false },
        })
        if (signal.aborted) throw new DOMException('Mention search canceled', 'AbortError')
        return result
      } finally {
        signal.removeEventListener('abort', cancel)
      }
    },
    enabled: enabled && isDesktopRuntime() && Boolean(targetPath) && query.length >= 2,
    retry: false,
    staleTime: 10_000,
  })

  useEffect(
    () => () => {
      void queryClient.cancelQueries({ exact: true, queryKey })
    },
    [queryClient, queryKey],
  )

  const mentions = useMemo(
    () =>
      targetPath
        ? buildUnlinkedMentions({
            backlinks,
            results: search.data?.results ?? [],
            targetPath,
          })
        : [],
    [backlinks, search.data, targetPath],
  )
  return {
    mentions,
    loading: search.isPending && search.fetchStatus === 'fetching',
    error:
      search.error instanceof Error
        ? search.error.message
        : search.error
          ? 'Unlinked mention search failed.'
          : null,
    retry: search.refetch,
  }
}
