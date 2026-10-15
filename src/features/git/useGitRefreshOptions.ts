import { useEffect, useMemo, useState } from 'react'
import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { createGitPollingCadence } from '@/features/git/gitPollingCadence'

const isForeground = () => document.visibilityState !== 'hidden' && document.hasFocus()
const POLLED_QUERIES = new Set([
  'git-status',
  'git-remote',
  'git-operation',
  'git-history',
  'git-branches',
  'git-stashes',
])

// Share Query's timers and request deduplication; only local Git reads are polled.
export const useGitRefreshOptions = (rootPath: string) => {
  const client = useQueryClient()
  const pending = useIsMutating({ mutationKey: ['git-repository-action'] }) > 0
  const [foreground, setForeground] = useState(isForeground)
  const cadence = useMemo(() => createGitPollingCadence(), [])
  useEffect(() => {
    cadence.reset()
  }, [cadence, pending, rootPath])
  useEffect(() => {
    const update = () => {
      const active = isForeground()
      setForeground(active)
      if (!active || client.isMutating({ mutationKey: ['git-repository-action'] })) return
      cadence.reset()
      void client.refetchQueries(
        {
          type: 'active',
          predicate: ({ queryKey }) =>
            queryKey[1] === rootPath &&
            typeof queryKey[0] === 'string' &&
            POLLED_QUERIES.has(queryKey[0]),
        },
        { cancelRefetch: false },
      )
    }
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [cadence, client, rootPath])
  return {
    refetchInterval: foreground && !pending ? cadence.interval : (false as const),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: foreground && !pending ? ('always' as const) : (false as const),
  }
}
