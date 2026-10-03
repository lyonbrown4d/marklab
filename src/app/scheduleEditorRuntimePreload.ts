import { preloadPlateMarkdownWorkers } from '@/services/plateMarkdownWorkerClient'

type EditorRuntimePreload = (targetWorkerCount: number) => Promise<void> | void

const PRELOAD_TARGETS = [1, 2, 3]
const PRELOAD_INTERVAL_MS = 750

const preloadPlateRuntime = (targetWorkerCount: number) =>
  preloadPlateMarkdownWorkers(targetWorkerCount)

export const scheduleEditorRuntimePreload = (
  preload: EditorRuntimePreload = preloadPlateRuntime,
): (() => void) => {
  let cancelled = false
  let idleRequestId: number | undefined
  let timeoutId: number | undefined
  let targetIndex = 0

  const scheduleNext = () => {
    if (cancelled || targetIndex >= PRELOAD_TARGETS.length) return
    timeoutId = window.setTimeout(schedule, PRELOAD_INTERVAL_MS)
  }

  const run = () => {
    if (cancelled || targetIndex >= PRELOAD_TARGETS.length) return
    const targetWorkerCount = PRELOAD_TARGETS[targetIndex]
    targetIndex += 1
    try {
      void Promise.resolve(preload(targetWorkerCount)).then(scheduleNext, () => undefined)
    } catch {
      // Preloading is an optional optimization and must not affect startup.
    }
  }

  const schedule = () => {
    if (cancelled) return
    if (typeof requestIdleCallback === 'function') {
      idleRequestId = requestIdleCallback(run)
      return
    }
    timeoutId = window.setTimeout(run, targetIndex === 0 ? 1_500 : PRELOAD_INTERVAL_MS)
  }

  schedule()
  return () => {
    cancelled = true
    if (idleRequestId !== undefined) cancelIdleCallback(idleRequestId)
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}
