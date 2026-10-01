type RetryOptions = {
  signal: AbortSignal
  maxAttempts?: number
  baseDelayMs?: number
  random?: () => number
  sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>
}

const NON_RETRYABLE = new Set(['unauthorized', 'validation', 'precondition_failed', 'conflict'])

export const withRemoteRetry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> => {
  const maximum = options.maxAttempts ?? 3
  let attempt = 0
  while (true) {
    options.signal.throwIfAborted()
    attempt += 1
    try {
      return await operation()
    } catch (error) {
      options.signal.throwIfAborted()
      const code = errorCode(error)
      if (NON_RETRYABLE.has(code) || code !== 'network' || attempt >= maximum) throw error
      const base = (options.baseDelayMs ?? 100) * 2 ** (attempt - 1)
      const jitter = Math.floor(base * 0.25 * (options.random ?? Math.random)())
      await (options.sleep ?? abortableSleep)(base + jitter, options.signal)
    }
  }
}

export const remoteErrorCode = (error: unknown): string => errorCode(error)

const errorCode = (error: unknown): string => {
  if (!error || typeof error !== 'object') return 'unknown'
  if ('status' in error && (error.status === 401 || error.status === 403)) return 'unauthorized'
  if (!('code' in error) || typeof error.code !== 'string') return 'unknown'
  return NORMALIZED_REMOTE_CODES[error.code] ?? error.code
}

const NORMALIZED_REMOTE_CODES: Readonly<Record<string, string>> = {
  ABORTED: 'aborted',
  AUTHENTICATION_FAILED: 'unauthorized',
  FORBIDDEN: 'unauthorized',
  INVALID_ENDPOINT: 'validation',
  INVALID_PATH: 'validation',
  INVALID_REQUEST: 'validation',
  NOT_FOUND: 'not_found',
  ORIGIN_MISMATCH: 'validation',
  REMOTE_ERROR: 'remote_io',
  TIMEOUT: 'network',
}

const abortableSleep = (delayMs: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    const timeout = setTimeout(finish, delayMs)
    const abort = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      reject(Object.assign(new Error('Sync retry aborted'), { name: 'AbortError' }))
    }
    signal.addEventListener('abort', abort, { once: true })
  })
