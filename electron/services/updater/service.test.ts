import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '@electron/services/logger.js'

const updaterEvents = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>())
const autoUpdaterMock = vi.hoisted(() => ({
  autoDownload: true,
  autoInstallOnAppQuit: true,
  checkForUpdates: vi.fn(async () => undefined),
  downloadUpdate: vi.fn(async () => undefined),
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    updaterEvents.set(event, handler)
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
  })

  it('reports unavailable outside packaged builds', async () => {
    const { createUpdateService } = await import('@electron/services/updater/service.js')
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

  it('emits available updates from updater events', async () => {
    const { createUpdateService } = await import('@electron/services/updater/service.js')
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
    const { createUpdateService } = await import('@electron/services/updater/service.js')
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
})
