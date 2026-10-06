import type { SyncProgress } from '@electron/services/sync/core/types'
import { WorkspaceSyncError } from '@electron/services/sync/core/types'
import { remoteErrorCode } from '@electron/services/sync/webdavSync/retry'

export const reportSyncProgress = (
  handler: ((progress: SyncProgress) => void) | undefined,
  stage: SyncProgress['stage'],
  completed = 0,
  total = 0,
): void => handler?.({ stage, completed, total })

export const workspaceSyncKey = (root: string): string =>
  process.platform === 'win32' || process.platform === 'darwin' ? root.toLowerCase() : root

export const linkSyncAbort = (
  signal: AbortSignal | undefined,
  controller: AbortController,
): (() => void) => {
  if (!signal) return () => undefined
  if (signal.aborted) controller.abort()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  return () => signal.removeEventListener('abort', abort)
}

export const raceSyncAbort = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError())
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export const normalizeSyncError = (error: unknown): Error => {
  if (error instanceof WorkspaceSyncError) return error
  if (error instanceof Error && error.name === 'AbortError') return abortedSyncError()
  const code = remoteErrorCode(error)
  if (code === 'unauthorized') {
    return new WorkspaceSyncError('unauthorized', 'Remote authorization failed')
  }
  if (code === 'aborted') return abortedSyncError()
  if (code === 'validation') {
    return new WorkspaceSyncError('validation', 'Remote request validation failed')
  }
  if (code === 'precondition_failed') {
    return new WorkspaceSyncError('precondition_failed', 'Remote manifest changed during sync')
  }
  if (code === 'network') {
    return new WorkspaceSyncError('network', 'Remote network request failed')
  }
  if (code === 'not_found' || code === 'remote_io') {
    return new WorkspaceSyncError('remote_io', 'Remote WebDAV operation failed', { cause: error })
  }
  if (error instanceof Error) {
    return new WorkspaceSyncError('local_io', error.message, { cause: error })
  }
  return new WorkspaceSyncError('remote_io', 'Workspace sync failed')
}

const abortError = (): Error =>
  Object.assign(new Error('Workspace sync was aborted'), { name: 'AbortError' })

const abortedSyncError = (): WorkspaceSyncError =>
  Object.assign(new WorkspaceSyncError('aborted', 'Workspace sync was aborted'), {
    name: 'AbortError',
  })
