import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { of, Subject, switchMap, timer } from 'rxjs'
import { fsApi, fsBufferStatusSchema, type FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/appTypes'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/useI18n'

// The desktop buffer normally auto-flushes after 700 ms. Waiting slightly longer lets the
// clean notification collapse a dirty typing burst into one index/graph refresh.
const INDEX_INVALIDATION_DELAY_MS = 900

export const useWorkspaceIndex = (workspaceKey: string, entries: FileEntry[], enabled: boolean) => {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const desktopAvailable = isDesktopRuntime()
  const entriesKey = useMemo(
    () => entries.map((entry) => `${entry.kind}:${entry.path}`).join('\n'),
    [entries],
  )
  const query = useQuery<FsWorkspaceIndex | null>({
    queryKey: ['workspace-index', workspaceKey, entriesKey],
    queryFn: () => fsApi.getWorkspaceIndex(),
    enabled: enabled && desktopAvailable,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (!enabled || !desktopAvailable) return

    let cancelled = false
    let unlisten: (() => void) | undefined
    const invalidateWorkspaceData = () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-index', workspaceKey] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-graph', workspaceKey] }),
      ]).catch((error) => {
        toast.error(t('workspaceIndex.refreshFailed'), {
          description: String(error),
        })
      })
    }
    const bufferStatus = new Subject<boolean>()
    const invalidation = bufferStatus
      .pipe(switchMap((dirty) => (dirty ? timer(INDEX_INVALIDATION_DELAY_MS) : of(0))))
      .subscribe(invalidateWorkspaceData)
    void listen<unknown>('fs-buffer-status', (event) => {
      const parsed = fsBufferStatusSchema.safeParse(event.payload)
      if (!parsed.success) return
      bufferStatus.next(parsed.data.dirty)
    }).then((nextUnlisten) => {
      if (cancelled) {
        nextUnlisten()
        return
      }
      unlisten = nextUnlisten
    })

    return () => {
      cancelled = true
      invalidation.unsubscribe()
      bufferStatus.complete()
      unlisten?.()
    }
  }, [desktopAvailable, enabled, queryClient, t, workspaceKey])

  const retry = query.refetch
  return {
    data: query.data ?? null,
    error: query.error ?? null,
    loading: query.isFetching && !query.data,
    refreshing: query.isFetching && Boolean(query.data),
    retry,
  }
}
