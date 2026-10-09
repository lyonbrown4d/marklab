import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '@electron/services/logger'

const autoUpdaterMock = vi.hoisted(() => ({
  autoDownload: true,
  autoInstallOnAppQuit: true,
  checkForUpdates: vi.fn(async () => undefined),
  downloadUpdate: vi.fn(async () => undefined),
  on: vi.fn(),
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

describe('update runtime capability', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not request the network for an unsupported packaged runtime', async () => {
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({
      capability: { reason: 'Use a manual download.', supported: false },
      isPackaged: true,
      logger,
    })

    const result = await service.checkForUpdates()
    service.startAutomaticChecks()

    expect(result).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Use a manual download.' }),
        ok: false,
        status: 'unavailable',
      }),
    )
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  })
})
