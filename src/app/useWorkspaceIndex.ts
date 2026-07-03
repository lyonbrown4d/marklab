import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fsApi, fsBufferStatusSchema, type FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/appTypes'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/useI18n'

export const useWorkspaceIndex = (entries: FileEntry[], enabled: boolean) => {
  const queryClient = useQueryClient()
  const { t } = useI18n()
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
    void listen<unknown>('fs-buffer-status', (event) => {
      const parsed = fsBufferStatusSchema.safeParse(event.payload)
      if (!parsed.success) return
      void queryClient.invalidateQueries({ queryKey: ['workspace-index'] }).catch((error) => {
        toast.error(t('workspaceIndex.refreshFailed'), {
          description: String(error),
        })
      })
    }).then((nextUnlisten) => {
      if (cancelled) {
        nextUnlisten()
        return
      }
      unlisten = nextUnlisten
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [enabled, queryClient, desktopAvailable, t])

  return query.data ?? null
}
