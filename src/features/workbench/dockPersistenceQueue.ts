import type { WorkspaceLayout } from '@/services/workspaceLayoutApi'

/** One workspace binding: serialize writes, retain failures, and only flush dirty snapshots. */
export const createDockPersistenceQueue = ({
  initial,
  save,
  onError,
  onSaved,
}: {
  initial?: WorkspaceLayout
  save: (layout: WorkspaceLayout) => Promise<unknown>
  onError: (error: unknown) => void
  onSaved?: () => void
}) => {
  let acknowledged = initial ? JSON.stringify(initial) : undefined
  let pending = initial
  let signature = acknowledged
  let timer: ReturnType<typeof setTimeout> | undefined
  let writing: Promise<void> | undefined
  let disposed = false
  let invalid: Error | undefined

  const clearTimer = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  const flush = (): Promise<void> => {
    clearTimer()
    if (invalid) return Promise.reject(invalid)
    if (writing) return writing.then(flush)
    if (disposed || signature === acknowledged) return Promise.resolve()
    const drain = async () => {
      while (!disposed && signature !== acknowledged) {
        if (invalid) throw invalid
        const snapshot = pending
        if (!snapshot) return
        const captured = signature
        try {
          await save(snapshot)
          acknowledged = captured
          if (!invalid) onSaved?.()
        } catch (error) {
          onError(error)
          throw error
        }
      }
    }
    writing = drain().finally(() => {
      writing = undefined
    })
    return writing.then(() => {
      if (invalid) throw invalid
    })
  }
  return {
    mark: (layout: WorkspaceLayout) => {
      if (disposed) return
      const wasInvalid = invalid !== undefined
      invalid = undefined
      const next = JSON.stringify(layout)
      if (next === signature && !wasInvalid) return
      pending = layout
      signature = next
      clearTimer()
      if (wasInvalid && signature === acknowledged && !writing) onSaved?.()
      if (signature !== acknowledged) {
        timer = setTimeout(() => {
          void flush().catch(() => {
            // The error was surfaced above; keep this snapshot dirty for explicit retry.
          })
        }, 250)
      }
    },
    invalidate: (error: Error) => {
      if (disposed || invalid) return
      invalid = error
      clearTimer()
      onError(error)
    },
    flush,
    dispose: () => {
      disposed = true
      clearTimer()
    },
  }
}
