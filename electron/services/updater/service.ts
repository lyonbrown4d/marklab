import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type {
  AppUpdateInfo,
  UpdateEventPayload,
  UpdateProgressInfo,
  UpdateResult,
  UpdateState,
} from '@electron/types.js'
import type { Logger } from '@electron/services/logger.js'

export type UpdateServiceOptions = {
  isPackaged: boolean
  logger: Logger
  onBeforeInstall?: () => Promise<void>
  onEvent?: (payload: UpdateEventPayload) => void
}

export type UpdateService = {
  checkForUpdates: () => Promise<UpdateResult>
  downloadUpdate: () => Promise<UpdateResult>
  getState: () => UpdateState
  installUpdate: () => Promise<UpdateResult>
}

const unavailableState: UpdateState = {
  status: 'unavailable',
  error: 'Updates are only available in packaged desktop builds.',
}

export const createUpdateService = ({
  isPackaged,
  logger,
  onBeforeInstall,
  onEvent,
}: UpdateServiceOptions): UpdateService => {
  let state: UpdateState = isPackaged ? { status: 'idle' } : unavailableState

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  const emit = (event: UpdateEventPayload['event'], patch: Partial<UpdateState> = {}) => {
    state = {
      ...state,
      ...patch,
    }
    const payload: UpdateEventPayload = {
      ...state,
      event,
    }
    onEvent?.(payload)
  }

  const fail = (error: unknown): UpdateResult => {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('update operation failed', { error })
    emit('error', { status: 'error', error: message })
    return { ...state, ok: false }
  }

  autoUpdater.on('checking-for-update', () => {
    logger.info('checking for updates')
    emit('checking', { error: undefined, progress: undefined, status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    logger.info('update available', { version: info.version })
    emit('available', { error: undefined, info: toAppUpdateInfo(info), status: 'available' })
  })

  autoUpdater.on('update-not-available', (info) => {
    logger.info('update not available', { version: info.version })
    emit('not-available', {
      error: undefined,
      info: toAppUpdateInfo(info),
      status: 'not-available',
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    emit('download-progress', { progress: toUpdateProgressInfo(progress), status: 'downloading' })
  })

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('update downloaded', { version: info.version })
    emit('downloaded', {
      error: undefined,
      info: toAppUpdateInfo(info),
      progress: undefined,
      status: 'downloaded',
    })
  })

  autoUpdater.on('error', (error) => {
    fail(error)
  })

  const ensurePackaged = (): UpdateResult | null => {
    if (isPackaged) return null
    emit('unavailable', unavailableState)
    return { ...state, ok: false }
  }

  return {
    getState: () => state,
    checkForUpdates: async () => {
      const unavailable = ensurePackaged()
      if (unavailable) return unavailable
      try {
        await autoUpdater.checkForUpdates()
        return { ...state, ok: state.status !== 'error' }
      } catch (error) {
        return fail(error)
      }
    },
    downloadUpdate: async () => {
      const unavailable = ensurePackaged()
      if (unavailable) return unavailable
      try {
        emit('download-progress', { error: undefined, status: 'downloading' })
        await autoUpdater.downloadUpdate()
        return { ...state, ok: state.status !== 'error' }
      } catch (error) {
        return fail(error)
      }
    },
    installUpdate: async () => {
      const unavailable = ensurePackaged()
      if (unavailable) return unavailable
      if (state.status !== 'downloaded') {
        return {
          ...state,
          ok: false,
          error: 'No downloaded update is ready to install.',
        }
      }
      try {
        emit('installing', { error: undefined, status: 'installing' })
        await onBeforeInstall?.()
        autoUpdater.quitAndInstall(false, true)
        return { ...state, ok: true }
      } catch (error) {
        return fail(error)
      }
    },
  }
}

const toAppUpdateInfo = (info: UpdateInfo): AppUpdateInfo => ({
  releaseDate: info.releaseDate,
  releaseName: info.releaseName ?? undefined,
  version: info.version,
})

const toUpdateProgressInfo = (progress: ProgressInfo): UpdateProgressInfo => ({
  bytesPerSecond: progress.bytesPerSecond,
  percent: progress.percent,
  transferred: progress.transferred,
  total: progress.total,
})
