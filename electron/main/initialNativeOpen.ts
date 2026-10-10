import type { Logger } from '@electron/services/logger'

const INITIAL_NATIVE_OPEN_TIMEOUT_MS = 10_000

export const createInitialNativeOpenPresentationGate = (present: () => void) => {
  let held: Promise<void> | null = null
  let presentationRequested = false

  const release = (settled: Promise<void>): void => {
    if (held !== settled) return
    held = null
    if (!presentationRequested) return
    presentationRequested = false
    present()
  }

  return {
    holdUntil: (settled: Promise<void>): void => {
      held = settled
      void settled.then(
        () => release(settled),
        () => release(settled),
      )
    },
    requestPresentation: (): void => {
      if (!held) {
        present()
        return
      }
      presentationRequested = true
    },
  }
}

export const scheduleInitialNativeOpenTimeout = ({
  logger,
  onTimeout,
  phase,
  target,
}: {
  logger: Logger
  onTimeout: () => void
  phase: 'application' | 'resolution'
  target?: string
}) => {
  let active = true
  const timeout = setTimeout(() => {
    if (!active) return
    active = false
    logger.warn('initial native open timed out', {
      phase,
      ...(target ? { target } : {}),
      timeoutMs: INITIAL_NATIVE_OPEN_TIMEOUT_MS,
    })
    onTimeout()
  }, INITIAL_NATIVE_OPEN_TIMEOUT_MS)

  return () => {
    if (!active) return
    active = false
    clearTimeout(timeout)
  }
}

const nativeOpenFailure = (result: unknown): string | null => {
  if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== false) {
    return null
  }
  return 'error' in result && typeof result.error === 'string'
    ? result.error
    : 'Native open request failed.'
}

const isAbortError = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')

export const runNativeOpenWithStartupTimeout = ({
  logger,
  onFinished,
  openSystemPath,
  request,
}: {
  logger: Logger
  onFinished: () => void
  openSystemPath: (
    path: string,
    disposition: 'current' | 'new',
    options?: { signal?: AbortSignal; startup?: boolean },
  ) => Promise<unknown>
  request: {
    disposition: 'current' | 'new'
    path: string
    startup: boolean
  }
}) => {
  let completed = false
  let cancelTimeout = (): void => undefined
  const finish = (): void => {
    if (completed) return
    completed = true
    cancelTimeout()
    onFinished()
  }
  const startupController = request.startup ? new AbortController() : null
  const opened = request.startup
    ? openSystemPath(request.path, request.disposition, {
        signal: startupController?.signal,
        startup: true,
      })
    : openSystemPath(request.path, request.disposition)
  if (request.startup) {
    cancelTimeout = scheduleInitialNativeOpenTimeout({
      logger,
      onTimeout: () => {
        startupController?.abort()
        finish()
      },
      phase: 'application',
      target: request.path,
    })
  }
  void opened
    .then((result) => {
      const error = nativeOpenFailure(result)
      if (!error) return
      if (startupController?.signal.aborted) {
        logger.debug('native open target canceled', { target: request.path })
        return
      }
      logger.warn('native open target failed', { error, target: request.path })
    })
    .catch((error) => {
      if (isAbortError(error)) {
        logger.debug('native open target canceled', { target: request.path })
        return
      }
      logger.warn('native open target failed', { error, target: request.path })
    })
    .finally(finish)
}
