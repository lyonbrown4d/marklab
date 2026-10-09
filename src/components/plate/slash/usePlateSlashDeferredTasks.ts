import { useCallback, useLayoutEffect, useRef } from 'react'

type DeferredTaskContext = {
  canEdit?: () => boolean
  contextToken: object
}

type ScheduledTask = DeferredTaskContext & { revision: number }

export const usePlateSlashDeferredTasks = ({ canEdit, contextToken }: DeferredTaskContext) => {
  const contextRef = useRef<DeferredTaskContext>({ canEdit, contextToken })
  const revisionRef = useRef(0)
  const microtaskSequenceRef = useRef(0)
  const microtasksRef = useRef(new Set<number>())
  const timeoutRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const cancelAnimationFrameTask = useCallback(() => {
    if (animationFrameRef.current == null) return
    window.cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = null
  }, [])

  const cancelPending = useCallback(() => {
    revisionRef.current += 1
    microtasksRef.current.clear()
    if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    cancelAnimationFrameTask()
  }, [cancelAnimationFrameTask])

  useLayoutEffect(() => {
    contextRef.current = { canEdit, contextToken }
    cancelPending()
    return cancelPending
  }, [canEdit, cancelPending, contextToken])

  const captureTask = useCallback(
    (): ScheduledTask => ({
      ...contextRef.current,
      revision: revisionRef.current,
    }),
    [],
  )

  const canRun = useCallback(
    ({ canEdit: taskCanEdit, contextToken: token, revision }: ScheduledTask) =>
      revisionRef.current === revision &&
      contextRef.current.contextToken === token &&
      (!contextRef.current.canEdit || contextRef.current.canEdit()) &&
      (!taskCanEdit || taskCanEdit()),
    [],
  )

  const scheduleMicrotask = useCallback(
    (task: () => void) => {
      const scheduled = captureTask()
      const id = ++microtaskSequenceRef.current
      microtasksRef.current.add(id)
      queueMicrotask(() => {
        if (!microtasksRef.current.delete(id) || !canRun(scheduled)) return
        task()
      })
    },
    [canRun, captureTask],
  )

  const scheduleTimeout = useCallback(
    (task: () => void) => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
      const scheduled = captureTask()
      const id = window.setTimeout(() => {
        if (timeoutRef.current !== id) return
        timeoutRef.current = null
        if (canRun(scheduled)) task()
      }, 0)
      timeoutRef.current = id
    },
    [canRun, captureTask],
  )

  const scheduleAnimationFrame = useCallback(
    (task: () => void) => {
      if (animationFrameRef.current != null) return
      const scheduled = captureTask()
      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null
        if (canRun(scheduled)) task()
      })
    },
    [canRun, captureTask],
  )

  return {
    cancelAnimationFrameTask,
    cancelPending,
    scheduleAnimationFrame,
    scheduleMicrotask,
    scheduleTimeout,
  }
}
