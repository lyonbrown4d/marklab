import { preloadPlateMarkdownWorkers } from '@/services/plateMarkdownWorkerClient'

type EditorRuntimePreload = (targetWorkerCount: number) => Promise<void> | void

const PRELOAD_TARGET_WORKERS = 1

const preloadPlateRuntime = (targetWorkerCount: number) =>
  preloadPlateMarkdownWorkers(targetWorkerCount)

export const scheduleEditorRuntimePreload = (
  preload: EditorRuntimePreload = preloadPlateRuntime,
): (() => void) => {
  let cancelled = false
  let idleRequestId: number | undefined
  let timeoutId: number | undefined

  const run = () => {
    if (cancelled) return
    try {
      void Promise.resolve(preload(PRELOAD_TARGET_WORKERS)).catch(() => undefined)
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
    timeoutId = window.setTimeout(run, 1_500)
  }

  schedule()
  return () => {
    cancelled = true
    if (idleRequestId !== undefined) cancelIdleCallback(idleRequestId)
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}
