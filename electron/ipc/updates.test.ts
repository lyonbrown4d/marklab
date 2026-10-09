import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateEventPayload } from '@electron/types'
import type { DesktopNotificationRequest } from '@electron/services/desktopNotificationService'
import type { UpdateServiceOptions } from '@electron/services/updater/service'
import { nativeIpcChannels } from '@electron/channels'

const updateService = vi.hoisted(() => ({
  checkForUpdates: vi.fn(),
  dispose: vi.fn(),
  downloadUpdate: vi.fn(),
  getState: vi.fn(),
  installUpdate: vi.fn(),
  setInstallOnQuit: vi.fn(),
  startAutomaticChecks: vi.fn(),
}))
const createUpdateService = vi.hoisted(() =>
  vi.fn<(options: unknown) => typeof updateService>(() => updateService),
)
const detectUpdateCapability = vi.hoisted(() =>
  vi.fn(() => ({ reason: 'Unsupported package.', supported: false as const })),
)

vi.mock('@electron/services/updater/service', () => ({ createUpdateService }))
vi.mock('@electron/services/updater/capability', () => ({ detectUpdateCapability }))

const logger = {
  child: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}

const createFixture = async () => {
  logger.child.mockReturnValue(logger)
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
  }
  const window = {
    focus: vi.fn(),
    isDestroyed: vi.fn(() => false),
    setProgressBar: vi.fn(),
    show: vi.fn(),
    webContents: { id: 7, send: vi.fn() },
  }
  const BrowserWindow = {
    getAllWindows: vi.fn(() => [window]),
  }
  const desktopNotifications = {
    show: vi.fn<(request: DesktopNotificationRequest) => boolean>(() => true),
  }
  const { registerUpdatesIpc } = await import('@electron/ipc/updates')
  const service = registerUpdatesIpc({
    app: { getAppPath: () => 'app-path', getVersion: () => '0.2.4', isPackaged: true } as never,
    BrowserWindow: BrowserWindow as never,
    desktopNotifications,
    ipcMain: ipcMain as never,
    logger: logger as never,
  })
  return { BrowserWindow, desktopNotifications, handlers, service, window }
}

describe('registerUpdatesIpc', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts automatic checks and passes the app version into the service', async () => {
    const { service } = await createFixture()

    expect(service.startAutomaticChecks).toHaveBeenCalledOnce()
    expect(createUpdateService).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: { reason: 'Unsupported package.', supported: false },
        currentVersion: '0.2.4',
        isPackaged: true,
      }),
    )
    expect(detectUpdateCapability).toHaveBeenCalledWith(
      expect.objectContaining({ appPath: 'app-path', isPackaged: true }),
    )
  })

  it('shows a background notification when an update finishes downloading', async () => {
    const { desktopNotifications, window } = await createFixture()
    const options = createUpdateService.mock.calls.at(-1)?.[0] as UpdateServiceOptions | undefined
    const payload: UpdateEventPayload = {
      currentVersion: '0.2.4',
      event: 'downloaded',
      info: { version: '0.3.0' },
      installOnQuit: false,
      status: 'downloaded',
    }

    options?.onEvent?.(payload)

    expect(desktopNotifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'update',
        id: 'update:downloaded',
        ownerWebContentsId: 7,
      }),
    )
    const notification = desktopNotifications.show.mock.calls[0]?.[0]
    notification?.onClick?.()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('registers a named handler for the install-on-exit policy', async () => {
    updateService.setInstallOnQuit.mockResolvedValueOnce({
      currentVersion: '0.2.4',
      installOnQuit: true,
      ok: true,
      status: 'downloaded',
    })
    const { handlers } = await createFixture()

    const result = await handlers.get(nativeIpcChannels.updatesSetInstallOnQuit)?.({}, true)

    expect(updateService.setInstallOnQuit).toHaveBeenCalledWith(true)
    expect(result).toEqual(expect.objectContaining({ installOnQuit: true, ok: true }))
  })
})
