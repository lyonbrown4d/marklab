import type { WebDavErrorCode } from '@electron/services/sync/webdav/types'

const messages: Record<WebDavErrorCode, string> = {
  ABORTED: 'WebDAV request was cancelled.',
  AUTHENTICATION_FAILED: 'WebDAV authentication failed.',
  FORBIDDEN: 'WebDAV access was denied.',
  INVALID_ENDPOINT: 'WebDAV endpoint is invalid.',
  INVALID_PATH: 'WebDAV path is invalid.',
  INVALID_REQUEST: 'WebDAV request is invalid.',
  NOT_FOUND: 'WebDAV resource was not found.',
  ORIGIN_MISMATCH: 'WebDAV response left the configured server origin.',
  REMOTE_ERROR: 'WebDAV request failed.',
  TIMEOUT: 'WebDAV request timed out.',
  network: 'WebDAV network request failed.',
  precondition_failed: 'WebDAV resource changed before the request completed.',
}

export class WebDavError extends Error {
  readonly code: WebDavErrorCode

  constructor(code: WebDavErrorCode) {
    super(messages[code])
    this.name = 'WebDavError'
    this.code = code
  }
}

export const toWebDavError = (
  error: unknown,
  signal: AbortSignal,
  timedOut: () => boolean,
): WebDavError => {
  if (error instanceof WebDavError) return error
  const status = readStatus(error)
  if (status === 401) return new WebDavError('AUTHENTICATION_FAILED')
  if (status === 403) return new WebDavError('FORBIDDEN')
  if (status === 404) return new WebDavError('NOT_FOUND')
  if (status === 412) return new WebDavError('precondition_failed')
  if (signal.aborted || isAbortError(error)) {
    return new WebDavError(timedOut() ? 'TIMEOUT' : 'ABORTED')
  }
  return new WebDavError('network')
}

const readStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined
  const record = error as Record<string, unknown>
  if (typeof record.status === 'number') return record.status
  const response = record.response
  if (response && typeof response === 'object' && 'status' in response) {
    const status = (response as Record<string, unknown>).status
    return typeof status === 'number' ? status : undefined
  }
  return undefined
}

const isAbortError = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
