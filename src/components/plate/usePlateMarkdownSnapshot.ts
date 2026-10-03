import type { Value } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { useCallback, useEffect, useRef } from 'react'
import { registerEditorSnapshotFlusher } from '@/app/editorCloseLifecycle'
import { serializePlateMarkdown } from '@/services/plateMarkdownWorkerClient'

type CancelScheduledSnapshot = () => void
type ScheduleSnapshot = (callback: () => void) => CancelScheduledSnapshot

type IdleWindow = {
  cancelIdleCallback?: (handle: number) => void
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
}

type UsePlateMarkdownSnapshotOptions = {
  editor: PlateEditor
  onError?: (error: Error) => void
  onSnapshot: (markdown: string) => Promise<void> | void
  schedule?: ScheduleSnapshot
  serialize?: (value: Value, signal: AbortSignal) => Promise<string> | string
}

const SNAPSHOT_IDLE_TIMEOUT_MS = 400
const SNAPSHOT_QUIET_PERIOD_MS = 750

export const schedulePlateMarkdownSnapshot: ScheduleSnapshot = (callback) => {
  const idleWindow = window as IdleWindow
  let idleHandle: number | null = null
  const quietHandle = window.setTimeout(() => {
    if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(callback, {
        timeout: SNAPSHOT_IDLE_TIMEOUT_MS,
      })
      return
    }
    callback()
  }, SNAPSHOT_QUIET_PERIOD_MS)
  return () => {
    window.clearTimeout(quietHandle)
    if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle)
  }
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
  const closeFlushRef = useRef<Promise<void> | null>(null)
  const dirtyRef = useRef(false)
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
    async (revision: number): Promise<boolean> => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const value = editor.children as Value
      try {
        const markdown = await callbacksRef.current.serialize(value, controller.signal)
        if (controller.signal.aborted || revision !== revisionRef.current) return false
        await callbacksRef.current.onSnapshot(markdown)
        if (controller.signal.aborted || revision !== revisionRef.current) return false
        dirtyRef.current = false
        return true
      } catch (error) {
        if (controller.signal.aborted || revision !== revisionRef.current) return false
        const snapshotError =
          error instanceof Error ? error : new Error('Markdown serialization failed.')
        callbacksRef.current.onError?.(snapshotError)
        throw snapshotError
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    },
    [editor],
  )

  const flushPending = useCallback(() => {
    cancelScheduled()
    if (!dirtyRef.current) return Promise.resolve()
    return serializeRevision(revisionRef.current).then(() => undefined)
  }, [cancelScheduled, serializeRevision])

  const flushForClose = useCallback(() => {
    if (closeFlushRef.current) return closeFlushRef.current
    if (!dirtyRef.current) return Promise.resolve()
    const task = (async () => {
      while (dirtyRef.current) {
        cancelScheduled()
        const revision = revisionRef.current
        if (await serializeRevision(revision)) return
      }
    })()
    const tracked = task.finally(() => {
      if (closeFlushRef.current === tracked) closeFlushRef.current = null
    })
    closeFlushRef.current = tracked
    return tracked
  }, [cancelScheduled, serializeRevision])

  const flush = useCallback(() => {
    if (closeFlushRef.current) return
    void flushPending().catch(() => undefined)
  }, [flushPending])

  const markDirty = useCallback(() => {
    dirtyRef.current = true
    abortRef.current?.abort()
    abortRef.current = null
    cancelScheduled()
    revisionRef.current += 1
  }, [cancelScheduled])

  const queue = useCallback(() => {
    markDirty()
    const revision = revisionRef.current
    if (closeFlushRef.current) return
    cancelScheduledRef.current = schedule(() => {
      cancelScheduledRef.current = null
      void serializeRevision(revision).catch(() => undefined)
    })
  }, [markDirty, schedule, serializeRevision])

  const cancel = useCallback(() => {
    dirtyRef.current = false
    revisionRef.current += 1
    cancelScheduled()
    abortRef.current?.abort()
    abortRef.current = null
  }, [cancelScheduled])

  useEffect(
    () => () => {
      cancelScheduled()
      if (abortRef.current) return
      void flushPending().catch(() => undefined)
    },
    [cancelScheduled, flushPending],
  )

  useEffect(() => registerEditorSnapshotFlusher(flushForClose), [flushForClose])

  return { cancel, flush, markDirty, queue }
}
