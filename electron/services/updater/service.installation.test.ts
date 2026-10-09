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
  removeListener: vi.fn(),
  quitAndInstall: vi.fn(),
}))

vi.mock('electron-updater', () => ({ autoUpdater: autoUpdaterMock }))

const logger: Logger = {
  child: () => logger,
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}

describe('update installation policy', () => {
  beforeEach(() => {
    updaterEvents.clear()
    vi.clearAllMocks()
    vi.useRealTimers()
    autoUpdaterMock.autoInstallOnAppQuit = false
  })

  it('installs exactly once on normal quit when enabled after the download completed', async () => {
    const { createUpdateService } = await import('@electron/services/updater/service')
    const events: unknown[] = []
    const service = createUpdateService({
      currentVersion: '0.2.4',
      isPackaged: true,
      logger,
      onEvent: (event) => events.push(event),
    })
    updaterEvents.get('update-downloaded')?.({ version: '0.3.0' })

    const result = await service.setInstallOnQuit(true)
    const firstQuit = service.quitAndInstallIfScheduled()
    const repeatedQuit = service.quitAndInstallIfScheduled()

    expect(result).toEqual(
      expect.objectContaining({ installOnQuit: true, ok: true, status: 'downloaded' }),
    )
    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(false)
    expect(firstQuit).toBe(true)
    expect(repeatedQuit).toBe(true)
    expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalledExactlyOnceWith(false, true)
    expect(events).toContainEqual(
      expect.objectContaining({ event: 'install-on-quit-changed', installOnQuit: true }),
    )
  })

  it('does not quit when flushing workspace buffers fails', async () => {
    const onBeforeInstall = vi.fn(async () => {
      throw new Error('flush failed')
    })
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger, onBeforeInstall })
    updaterEvents.get('update-downloaded')?.({ version: '0.3.0' })

    const result = await service.installUpdate()

    expect(result).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'flush failed', operation: 'install' }),
        ok: false,
      }),
    )
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled()
  })

  it('reports a synchronous quitAndInstall failure instead of returning success', async () => {
    autoUpdaterMock.quitAndInstall.mockImplementationOnce(() => {
      updaterEvents.get('error')?.(new Error('installer launch failed'))
    })
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })
    updaterEvents.get('update-downloaded')?.({ version: '0.3.0' })

    const result = await service.installUpdate()

    expect(result).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'installer launch failed',
          operation: 'install',
        }),
        ok: false,
      }),
    )
  })

  it('falls back to a normal quit when scheduled installation emits an error synchronously', async () => {
    autoUpdaterMock.quitAndInstall.mockImplementationOnce(() => {
      updaterEvents.get('error')?.(new Error('scheduled installer launch failed'))
    })
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })
    updaterEvents.get('update-downloaded')?.({ version: '0.3.0' })
    await service.setInstallOnQuit(true)

    const installerOwnsQuit = service.quitAndInstallIfScheduled()

    expect(installerOwnsQuit).toBe(false)
    expect(service.getState()).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'scheduled installer launch failed',
          operation: 'install',
        }),
        status: 'error',
      }),
    )
  })

  it('reports an asynchronous installer error through the quit handoff fallback', async () => {
    autoUpdaterMock.quitAndInstall.mockImplementationOnce(() => {
      queueMicrotask(() => {
        updaterEvents.get('error')?.(new Error('asynchronous installer failure'))
      })
    })
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })
    const onFailure = vi.fn()
    updaterEvents.get('update-downloaded')?.({ version: '0.3.0' })
    await service.setInstallOnQuit(true)

    expect(service.quitAndInstallIfScheduled(onFailure)).toBe(true)
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledOnce())

    expect(service.getState()).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'asynchronous installer failure' }),
        status: 'error',
      }),
    )
  })

  it('abandons a stalled installer handoff after a bounded timeout', async () => {
    vi.useFakeTimers()
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })
    const onFailure = vi.fn()
    updaterEvents.get('update-downloaded')?.({ version: '0.3.0' })
    await service.setInstallOnQuit(true)

    expect(service.quitAndInstallIfScheduled(onFailure)).toBe(true)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(onFailure).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(onFailure).toHaveBeenCalledOnce()
    expect(service.getState()).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: expect.stringContaining('timed out') }),
        status: 'error',
      }),
    )
  })
})
