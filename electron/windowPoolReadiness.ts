import type { BrowserWindow } from 'electron'

type ReadinessWaiter = {
  reject: (error: Error) => void
  resolve: () => void
  timeoutHandle?: unknown
}

type RendererReadiness = {
  error: Error | null
  interactive: boolean
  waiters: Set<ReadinessWaiter>
}

export type WindowPoolReadiness = {
  cancel: (window: BrowserWindow, error?: Error) => void
  markInteractive: (window: BrowserWindow, error?: Error) => void
  reset: (window: BrowserWindow) => void
  waitForInteractive: (window: BrowserWindow) => Promise<void>
}

type WindowPoolReadinessOptions = {
  cancelTimeout?: (handle: unknown) => void
  interactiveTimeoutMs?: number
  scheduleTimeout?: (callback: () => void, timeoutMs: number) => unknown
}

const DEFAULT_INTERACTIVE_TIMEOUT_MS = 60_000

const cancellationError = (): Error =>
  new Error('Renderer activation was cancelled because its window closed.')

export const createWindowPoolReadiness = (
  options: WindowPoolReadinessOptions = {},
): WindowPoolReadiness => {
  const readiness = new WeakMap<BrowserWindow, RendererReadiness>()
  const cancelTimeout =
    options.cancelTimeout ??
    ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  const interactiveTimeoutMs = Math.max(
    1,
    options.interactiveTimeoutMs ?? DEFAULT_INTERACTIVE_TIMEOUT_MS,
  )
  const scheduleTimeout =
    options.scheduleTimeout ??
    ((callback: () => void, timeoutMs: number) => setTimeout(callback, timeoutMs))

  const stateFor = (window: BrowserWindow): RendererReadiness => {
    const current = readiness.get(window)
    if (current) return current
    const created: RendererReadiness = {
      error: null,
      interactive: false,
      waiters: new Set(),
    }
    readiness.set(window, created)
    return created
  }

  const settle = (window: BrowserWindow, error: Error | null): void => {
    const state = stateFor(window)
    if (state.interactive || state.error) return
    state.error = error
    state.interactive = error === null
    for (const waiter of state.waiters) {
      if (waiter.timeoutHandle !== undefined) cancelTimeout(waiter.timeoutHandle)
      if (error) waiter.reject(error)
      else waiter.resolve()
    }
    state.waiters.clear()
  }

  return {
    cancel: (window, error = cancellationError()) => settle(window, error),
    markInteractive: (window, error) => settle(window, error ?? null),
    reset: (window) => readiness.delete(window),
    waitForInteractive: (window) => {
      const state = stateFor(window)
      if (state.error) return Promise.reject(state.error)
      if (state.interactive) return Promise.resolve()
      return new Promise<void>((resolve, reject) => {
        const waiter: ReadinessWaiter = { reject, resolve }
        state.waiters.add(waiter)
        const timeoutHandle = scheduleTimeout(() => {
          settle(
            window,
            new Error(
              `Renderer did not become interactive within ${interactiveTimeoutMs.toString()}ms.`,
            ),
          )
        }, interactiveTimeoutMs)
        waiter.timeoutHandle = timeoutHandle
        if (state.error || state.interactive) cancelTimeout(timeoutHandle)
      })
    },
  }
}
