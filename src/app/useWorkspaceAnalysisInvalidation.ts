import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { of, Subject, switchMap, timer } from 'rxjs'
import { isDesktopRuntime } from '@/runtime/environment'
import { listen } from '@/runtime/events'
import { fsBufferStatusSchema } from '@/services/fsApi'

const DIRTY_INVALIDATION_DELAY_MS = 900
const analysisQueryPrefixes = [
  'workspace-navigation',
  'workspace-knowledge-summary',
  'workspace-pages',
  'workspace-document-insights',
  'workspace-graph',
] as const

export const useWorkspaceAnalysisInvalidation = (workspaceKey: string): void => {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isDesktopRuntime()) return

    let cancelled = false
    let unlisten: Array<() => void> = []
    const delays = new Subject<number>()
    const subscription = delays
      .pipe(switchMap((delayMs) => (delayMs > 0 ? timer(delayMs) : of(0))))
      .subscribe(() => {
        for (const prefix of analysisQueryPrefixes) {
          void queryClient.invalidateQueries({ queryKey: [prefix, workspaceKey] })
        }
      })

    void Promise.all([
      listen<unknown>('fs-buffer-status', (event) => {
        const status = fsBufferStatusSchema.safeParse(event.payload)
        if (!status.success) return
        delays.next(status.data.dirty ? DIRTY_INVALIDATION_DELAY_MS : 0)
      }),
      listen('fs-changed', () => delays.next(0)),
    ]).then((listeners) => {
      if (cancelled) {
        listeners.forEach((stop) => stop())
        return
      }
      unlisten = listeners
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
      delays.complete()
      unlisten.forEach((stop) => stop())
    }
  }, [queryClient, workspaceKey])
}
