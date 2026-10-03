import type { Value } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { useCallback, useEffect, useRef } from 'react'
import { serializePlateMarkdown } from '@/services/plateMarkdownWorkerClient'

type CancelScheduledSnapshot = () => void
type ScheduleSnapshot = (callback: () => void) => CancelScheduledSnapshot

type IdleWindow = Window & {
  cancelIdleCallback?: (handle: number) => void
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
}

type UsePlateMarkdownSnapshotOptions = {
  editor: PlateEditor
  onError?: (error: Error) => void
  onSnapshot: (markdown: string) => void
  schedule?: ScheduleSnapshot
  serialize?: (value: Value, signal: AbortSignal) => Promise<string> | string
}

const SNAPSHOT_TIMEOUT_MS = 400

export const schedulePlateMarkdownSnapshot: ScheduleSnapshot = (callback) => {
  const idleWindow = window as IdleWindow
  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: SNAPSHOT_TIMEOUT_MS })
    return () => idleWindow.cancelIdleCallback?.(handle)
  }
  const handle = window.setTimeout(callback, 160)
  return () => window.clearTimeout(handle)
}

export const usePlateMarkdownSnapshot = ({
  editor,
  onError,
  onSnapshot,
  schedule = schedulePlateMarkdownSnapshot,
  serialize = (value, signal) => serializePlateMarkdown(editor, value, signal),
}: UsePlateMarkdownSnapshotOptions) => {
  const abortRef = useRef<AbortController | null>(null)
  const cancelScheduledRef = useRef<CancelScheduledSnapshot | null>(null)
  const revisionRef = useRef(0)
  const callbacksRef = useRef({ onError, onSnapshot, serialize })

  useEffect(() => {
    callbacksRef.current = { onError, onSnapshot, serialize }
  }, [onError, onSnapshot, serialize])

  const cancelScheduled = useCallback(() => {
    cancelScheduledRef.current?.()
    cancelScheduledRef.current = null
  }, [])

  const serializeRevision = useCallback(
    (revision: number) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const value = editor.children as Value
      void Promise.resolve(callbacksRef.current.serialize(value, controller.signal)).then(
        (markdown) => {
          if (controller.signal.aborted || revision !== revisionRef.current) return
          abortRef.current = null
          callbacksRef.current.onSnapshot(markdown)
        },
        (error: unknown) => {
          if (controller.signal.aborted || revision !== revisionRef.current) return
          abortRef.current = null
          callbacksRef.current.onError?.(
            error instanceof Error ? error : new Error('Markdown serialization failed.'),
          )
        },
      )
    },
    [editor],
  )

  const flush = useCallback(() => {
    cancelScheduled()
    const revision = ++revisionRef.current
    serializeRevision(revision)
  }, [cancelScheduled, serializeRevision])

  const queue = useCallback(() => {
    cancelScheduled()
    const revision = ++revisionRef.current
    cancelScheduledRef.current = schedule(() => {
      cancelScheduledRef.current = null
      serializeRevision(revision)
    })
  }, [cancelScheduled, schedule, serializeRevision])

  const cancel = useCallback(() => {
    revisionRef.current += 1
    cancelScheduled()
    abortRef.current?.abort()
    abortRef.current = null
  }, [cancelScheduled])

  useEffect(() => cancel, [cancel])

  return { cancel, flush, queue }
}
