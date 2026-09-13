import { useEffect, useState, type RefObject } from 'react'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsSnapshotSchema } from '@/services/fsApi'

export const useEditorBufferInvalidation = (
  workspaceKey: string,
  syncedContentsRef: RefObject<Record<string, string>>,
  activePath: string | null,
) => {
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!isDesktopRuntime()) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void listen<unknown>('fs-changed', (event) => {
      if (cancelled) return
      const snapshot = fsSnapshotSchema.safeParse(event.payload)
      if (!snapshot.success) return
      const { root } = snapshot.data
      if (workspaceKey !== `${root.kind}:${root.path}`) return
      // Keep local text and dirty revisions. Only the disk-read baseline expires.
      // Inactive clean documents will be read again when they are selected.
      syncedContentsRef.current = {}
      if (
        snapshot.data.entries.some((entry) => entry.kind === 'file' && entry.path === activePath)
      ) {
        setGeneration((value) => value + 1)
      }
    })
      .then((unsubscribe) => {
        if (cancelled) unsubscribe()
        else unlisten = unsubscribe
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error('Failed to subscribe to workspace file changes', error)
      })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [activePath, syncedContentsRef, workspaceKey])

  return generation
}
