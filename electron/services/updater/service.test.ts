import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '@electron/services/logger'

const updaterEvents = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>())
const autoUpdaterMock = vi.hoisted(() => ({
  autoDownload: true,
  autoInstallOnAppQuit: true,
  checkForUpdates: vi.fn(async () => undefined),
  downloadUpdate: vi.fn(async () => undefined),
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    updaterEvents.set(event, handler)
  }),
  removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (updaterEvents.get(event) === handler) updaterEvents.delete(event)
  }),
  quitAndInstall: vi.fn(),
}))

vi.mock('electron-updater', () => ({
  autoUpdater: autoUpdaterMock,
}))

const logger: Logger = {
  child: () => logger,
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}

describe('createUpdateService', () => {
  beforeEach(() => {
    updaterEvents.clear()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('reports unavailable outside packaged builds', async () => {
    const { createUpdateService } = await import('@electron/services/updater/service')
    const events: unknown[] = []
    const service = createUpdateService({
      isPackaged: false,
      logger,
      onEvent: (event) => events.push(event),
    })

    const result = await service.checkForUpdates()

    expect(result.ok).toBe(false)
    expect(result.status).toBe('unavailable')
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'unavailable',
        status: 'unavailable',
      }),
    )
  })

  it('exposes the running application version in every state', async () => {
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({
      currentVersion: '0.2.4',
      isPackaged: true,
      logger,
    })

    expect(service.getState()).toEqual({
      currentVersion: '0.2.4',
      installOnQuit: false,
      status: 'idle',
    })
  })

  it('emits available updates from updater events', async () => {
    const { createUpdateService } = await import('@electron/services/updater/service')
    const events: unknown[] = []
    const service = createUpdateService({
      isPackaged: true,
      logger,
      onEvent: (event) => events.push(event),
    })

    updaterEvents.get('update-available')?.({
      releaseDate: '2026-06-09T00:00:00.000Z',
      releaseName: 'Marklab 0.3.0',
      version: '0.3.0',
    })

    expect(service.getState()).toEqual(
      expect.objectContaining({
        info: expect.objectContaining({ version: '0.3.0' }),
        status: 'available',
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'available',
        info: expect.objectContaining({ version: '0.3.0' }),
      }),
    )
  })

  it('flushes before installing downloaded updates', async () => {
    const { createUpdateService } = await import('@electron/services/updater/service')
    const onBeforeInstall = vi.fn(async () => undefined)
    const service = createUpdateService({
      isPackaged: true,
      logger,
      onBeforeInstall,
    })

    updaterEvents.get('update-downloaded')?.({
      releaseDate: '2026-06-09T00:00:00.000Z',
      version: '0.3.0',
    })
    const result = await service.installUpdate()

    expect(result.ok).toBe(true)
    expect(onBeforeInstall).toHaveBeenCalledTimes(1)
    expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('returns a structured check error', async () => {
    autoUpdaterMock.checkForUpdates.mockRejectedValueOnce(new Error('network down'))
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })

    const result = await service.checkForUpdates()

    expect(result).toEqual(
      expect.objectContaining({
        error: { code: 'CHECK_FAILED', message: 'network down', operation: 'check' },
        ok: false,
        status: 'error',
      }),
    )
    expect(logger.warn).toHaveBeenCalledWith(
      'update operation failed',
      expect.objectContaining({ code: 'CHECK_FAILED', operation: 'check' }),
    )
  })

  it('returns a structured error when no update is ready to install', async () => {
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })

    const result = await service.installUpdate()

    expect(result.error).toEqual({
      code: 'NOT_READY',
      message: 'No downloaded update is ready to install.',
      operation: 'install',
    })
  })

  it('deduplicates concurrent update checks', async () => {
    let resolveCheck!: () => void
    autoUpdaterMock.checkForUpdates.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCheck = () => resolve(undefined)
      }),
    )
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })

    const first = service.checkForUpdates()
    const second = service.checkForUpdates()

    expect(first).toBe(second)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledOnce()
    resolveCheck()
    await first
  })

  it('deduplicates concurrent downloads', async () => {
    let resolveDownload!: () => void
    autoUpdaterMock.downloadUpdate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDownload = () => resolve(undefined)
      }),
    )
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })

    const first = service.downloadUpdate()
    const second = service.downloadUpdate()

    expect(first).toBe(second)
    expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledOnce()
    resolveDownload()
    await first
  })

  it('skips checks while a download is in flight', async () => {
    let resolveDownload!: () => void
    autoUpdaterMock.downloadUpdate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDownload = () => resolve(undefined)
      }),
    )
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })

    const download = service.downloadUpdate()
    const check = service.checkForUpdates()

    expect(check).toBe(download)
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    resolveDownload()
    await download
  })

  it('waits for an in-flight check before starting one shared download', async () => {
    let resolveCheck!: () => void
    autoUpdaterMock.checkForUpdates.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCheck = () => resolve(undefined)
      }),
    )
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })

    const check = service.checkForUpdates()
    const firstDownload = service.downloadUpdate()
    const secondDownload = service.downloadUpdate()

    expect(firstDownload).toBe(secondDownload)
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
    resolveCheck()
    await check
    await firstDownload
    expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledOnce()
  })

  it('checks after the startup delay and then every six hours', async () => {
    vi.useFakeTimers()
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })

    service.startAutomaticChecks()
    await vi.advanceTimersByTimeAsync(14_999)
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('does not schedule network checks in unpackaged builds', async () => {
    vi.useFakeTimers()
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: false, logger })

    service.startAutomaticChecks()
    await vi.runAllTimersAsync()

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans scheduled checks and updater listeners on disposal', async () => {
    vi.useFakeTimers()
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })
    service.startAutomaticChecks()

    service.dispose()
    await vi.runAllTimersAsync()

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(autoUpdaterMock.removeListener).toHaveBeenCalledTimes(6)
  })
})
