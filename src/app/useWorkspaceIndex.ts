import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fsApi, fsBufferStatusSchema, type FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/appTypes'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/useI18n'

const INDEX_INVALIDATION_DELAY_MS = 120

export const useWorkspaceIndex = (entries: FileEntry[], enabled: boolean) => {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const invalidationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const desktopAvailable = isDesktopRuntime()
  const entriesKey = useMemo(
    () => entries.map((entry) => `${entry.kind}:${entry.path}`).join('\n'),
    [entries],
  )
  const query = useQuery<FsWorkspaceIndex | null>({
    queryKey: ['workspace-index', entriesKey],
    queryFn: () => fsApi.getWorkspaceIndex(),
    enabled: enabled && desktopAvailable,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (!enabled || !desktopAvailable) return

    let cancelled = false
    let unlisten: (() => void) | undefined
    const invalidateIndex = () => {
      invalidationTimerRef.current = null
      void queryClient.invalidateQueries({ queryKey: ['workspace-index'] }).catch((error) => {
        toast.error(t('workspaceIndex.refreshFailed'), {
          description: String(error),
        })
      })
    }
    void listen<unknown>('fs-buffer-status', (event) => {
      const parsed = fsBufferStatusSchema.safeParse(event.payload)
      if (!parsed.success) return
      if (!parsed.data.dirty) {
        if (invalidationTimerRef.current != null) {
          clearTimeout(invalidationTimerRef.current)
        }
        invalidateIndex()
        return
      }
      if (invalidationTimerRef.current != null) {
        clearTimeout(invalidationTimerRef.current)
      }
      invalidationTimerRef.current = setTimeout(invalidateIndex, INDEX_INVALIDATION_DELAY_MS)
    }).then((nextUnlisten) => {
      if (cancelled) {
        nextUnlisten()
        return
      }
      unlisten = nextUnlisten
    })

    return () => {
      cancelled = true
      if (invalidationTimerRef.current != null) {
        clearTimeout(invalidationTimerRef.current)
        invalidationTimerRef.current = null
      }
      unlisten?.()
    }
  }, [enabled, queryClient, desktopAvailable, t])

  return query.data ?? null
}
