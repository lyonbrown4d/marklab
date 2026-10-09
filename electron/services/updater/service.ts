import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { UpdateEventPayload, UpdateResult, UpdateState } from '@electron/types'
import type { UpdateService, UpdateServiceOptions } from '@electron/services/updater/contract'
import { createInstallHandoff } from '@electron/services/updater/installHandoff'
import { toAppUpdateInfo, toUpdateProgressInfo } from '@electron/services/updater/stateMapping'

export type { UpdateService, UpdateServiceOptions } from '@electron/services/updater/contract'

const INITIAL_CHECK_DELAY_MS = 15_000
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export const createUpdateService = ({
  capability,
  currentVersion = 'unknown',
  isPackaged,
  logger,
  onBeforeInstall,
  onEvent,
}: UpdateServiceOptions): UpdateService => {
  const updatesSupported = isPackaged && (capability?.supported ?? true)
  const unavailableState: UpdateState = {
    currentVersion,
    installOnQuit: false,
    status: 'unavailable',
    error: {
      code: 'UNAVAILABLE',
      message:
        capability && !capability.supported
          ? capability.reason
          : 'Updates are only available in packaged desktop builds.',
      operation: 'availability',
    },
  }
  let state: UpdateState = updatesSupported
    ? { currentVersion, installOnQuit: false, status: 'idle' }
    : unavailableState
  let checkPromise: Promise<UpdateResult> | null = null
  let downloadPromise: Promise<UpdateResult> | null = null
  let initialCheckTimer: ReturnType<typeof setTimeout> | null = null
  let periodicCheckTimer: ReturnType<typeof setInterval> | null = null
  let installationStarted = false
  let disposed = false

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

  const fail = (error: unknown, operation: 'check' | 'download' | 'install'): UpdateResult => {
    const message = error instanceof Error ? error.message : String(error)
    const code =
      operation === 'check'
        ? 'CHECK_FAILED'
        : operation === 'download'
          ? 'DOWNLOAD_FAILED'
          : 'INSTALL_FAILED'
    logger.warn('update operation failed', { code, error, operation })
    emit('error', { status: 'error', error: { code, message, operation } })
    return { ...state, ok: false }
  }

  const installHandoff = createInstallHandoff({
    onTimeout: () => fail(new Error('Installer handoff timed out.'), 'install'),
  })

  const handleChecking = () => {
    logger.info('checking for updates')
    emit('checking', { error: undefined, progress: undefined, status: 'checking' })
  }

  const handleAvailable = (info: UpdateInfo) => {
    autoUpdater.autoInstallOnAppQuit = false
    logger.info('update available', { version: info.version })
    emit('available', {
      error: undefined,
      info: toAppUpdateInfo(info),
      installOnQuit: false,
      status: 'available',
    })
  }

  const handleNotAvailable = (info: UpdateInfo) => {
    logger.info('update not available', { version: info.version })
    emit('not-available', {
      error: undefined,
      info: toAppUpdateInfo(info),
      installOnQuit: false,
      status: 'not-available',
    })
  }

  const handleDownloadProgress = (progress: ProgressInfo) => {
    emit('download-progress', { progress: toUpdateProgressInfo(progress), status: 'downloading' })
  }

  const handleDownloaded = (info: UpdateInfo) => {
    logger.info('update downloaded', { version: info.version })
    emit('downloaded', {
      error: undefined,
      info: toAppUpdateInfo(info),
      installOnQuit: false,
      progress: undefined,
      status: 'downloaded',
    })
  }

  const handleError = (error: Error) => {
    const operation =
      state.status === 'downloading'
        ? 'download'
        : state.status === 'installing'
          ? 'install'
          : 'check'
    fail(error, operation)
    if (operation === 'install') installHandoff.fail()
  }

  const updaterListeners = [
    ['checking-for-update', handleChecking],
    ['update-available', handleAvailable],
    ['update-not-available', handleNotAvailable],
    ['download-progress', handleDownloadProgress],
    ['update-downloaded', handleDownloaded],
    ['error', handleError],
  ] as const
  for (const [event, handler] of updaterListeners) autoUpdater.on(event, handler)

  const ensurePackaged = (): UpdateResult | null => {
    if (updatesSupported) return null
    emit('unavailable', unavailableState)
    return { ...state, ok: false }
  }

  const runCheck = async (): Promise<UpdateResult> => {
    const unavailable = ensurePackaged()
    if (unavailable) return unavailable
    try {
      await autoUpdater.checkForUpdates()
      return { ...state, ok: state.status !== 'error' }
    } catch (error) {
      return fail(error, 'check')
    }
  }

  const checkForUpdates = (): Promise<UpdateResult> => {
    if (downloadPromise) return downloadPromise
    if (checkPromise) return checkPromise
    checkPromise = runCheck().finally(() => {
      checkPromise = null
    })
    return checkPromise
  }

  const runDownload = async (): Promise<UpdateResult> => {
    const unavailable = ensurePackaged()
    if (unavailable) return unavailable
    try {
      emit('download-progress', { error: undefined, status: 'downloading' })
      await autoUpdater.downloadUpdate()
      return { ...state, ok: state.status !== 'error' }
    } catch (error) {
      return fail(error, 'download')
    }
  }

  const downloadUpdate = (): Promise<UpdateResult> => {
    if (downloadPromise) return downloadPromise
    const operation = checkPromise ? checkPromise.then(runDownload) : runDownload()
    downloadPromise = operation.finally(() => {
      downloadPromise = null
    })
    return downloadPromise
  }

  const startAutomaticChecks = (): void => {
    if (!updatesSupported || disposed || initialCheckTimer || periodicCheckTimer) return
    logger.info('automatic update checks scheduled', {
      initialDelayMs: INITIAL_CHECK_DELAY_MS,
      intervalMs: PERIODIC_CHECK_INTERVAL_MS,
    })
    initialCheckTimer = setTimeout(() => {
      initialCheckTimer = null
      void checkForUpdates()
      periodicCheckTimer = setInterval(() => {
        void checkForUpdates()
      }, PERIODIC_CHECK_INTERVAL_MS)
    }, INITIAL_CHECK_DELAY_MS)
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    if (initialCheckTimer) clearTimeout(initialCheckTimer)
    if (periodicCheckTimer) clearInterval(periodicCheckTimer)
    initialCheckTimer = null
    periodicCheckTimer = null
    installHandoff.dispose()
    for (const [event, handler] of updaterListeners) autoUpdater.removeListener(event, handler)
  }

  const setInstallOnQuit = async (enabled: boolean): Promise<UpdateResult> => {
    const unavailable = ensurePackaged()
    if (unavailable) return unavailable
    if (enabled && state.status !== 'downloaded') {
      return {
        ...state,
        error: {
          code: 'NOT_READY',
          message: 'No downloaded update is ready to install when the app exits.',
          operation: 'install-on-quit',
        },
        ok: false,
      }
    }
    emit('install-on-quit-changed', { error: undefined, installOnQuit: enabled })
    return { ...state, ok: true }
  }

  const launchInstaller = (): UpdateResult => {
    installationStarted = true
    try {
      autoUpdater.quitAndInstall(false, true)
      if (state.status === 'error') {
        installationStarted = false
        return { ...state, ok: false }
      }
      return { ...state, ok: true }
    } catch (error) {
      installationStarted = false
      return fail(error, 'install')
    }
  }

  const quitAndInstallIfScheduled = (onFailure: () => void = () => undefined): boolean => {
    if (installationStarted) return true
    if (!state.installOnQuit || state.status !== 'downloaded') return false
    emit('installing', { error: undefined, status: 'installing' })
    const result = launchInstaller()
    if (result.ok) installHandoff.begin(onFailure)
    return result.ok
  }

  return {
    checkForUpdates,
    dispose,
    downloadUpdate,
    getState: () => state,
    installUpdate: async () => {
      const unavailable = ensurePackaged()
      if (unavailable) return unavailable
      if (state.status !== 'downloaded') {
        return {
          ...state,
          ok: false,
          error: {
            code: 'NOT_READY',
            message: 'No downloaded update is ready to install.',
            operation: 'install',
          },
        }
      }
      try {
        emit('installing', { error: undefined, status: 'installing' })
        await onBeforeInstall?.()
        return launchInstaller()
      } catch (error) {
        return fail(error, 'install')
      }
    },
    quitAndInstallIfScheduled,
    setInstallOnQuit,
    startAutomaticChecks,
  }
}
