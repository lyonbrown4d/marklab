import type { BrowserWindow } from 'electron'

export const DEFAULT_IDLE_WINDOW_TTL_MS = 2 * 60 * 1000

export const createWindowPoolIdleRetention = (
  discard: (window: BrowserWindow) => void,
  ttlMs = DEFAULT_IDLE_WINDOW_TTL_MS,
) => {
  const timers = new Map<BrowserWindow, ReturnType<typeof setTimeout>>()
  const cancel = (window: BrowserWindow) => {
    const timer = timers.get(window)
    if (timer) clearTimeout(timer)
    timers.delete(window)
  }
  const retain = (window: BrowserWindow) => {
    cancel(window)
    const timer = setTimeout(() => {
      timers.delete(window)
      discard(window)
    }, ttlMs)
    timer.unref?.()
    timers.set(window, timer)
  }
  return { cancel, retain }
}
