import { toWebDavError } from '@electron/services/sync/webdav/errors'
import type { WebDavOperationOptions } from '@electron/services/sync/webdav/types'

export type WebDavRequestControl = {
  signal: AbortSignal
  run: <T>(work: (signal: AbortSignal) => Promise<T>) => Promise<T>
  dispose: () => void
  mapError: (error: unknown) => Error
}

export const createWebDavRequestControl = (
  options: WebDavOperationOptions | undefined,
  defaultTimeoutMs: number,
): WebDavRequestControl => {
  const controller = new AbortController()
  let timeoutTriggered = false
  const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300_000) {
    throw new Error('WebDAV timeout must be between 1 and 300000 milliseconds')
  }
  const onCallerAbort = () => controller.abort(options?.signal?.reason)
  if (options?.signal?.aborted) onCallerAbort()
  else options?.signal?.addEventListener('abort', onCallerAbort, { once: true })
  const timer = setTimeout(() => {
    timeoutTriggered = true
    controller.abort(new DOMException('WebDAV request timed out', 'TimeoutError'))
  }, timeoutMs)
  timer.unref?.()
  const dispose = () => {
    clearTimeout(timer)
    options?.signal?.removeEventListener('abort', onCallerAbort)
  }
  const mapError = (error: unknown): Error =>
    toWebDavError(error, controller.signal, () => timeoutTriggered)
  return {
    signal: controller.signal,
    dispose,
    mapError,
    run: async <T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      try {
        return await work(controller.signal)
      } catch (error) {
        throw mapError(error)
      } finally {
        dispose()
      }
    },
  }
}
