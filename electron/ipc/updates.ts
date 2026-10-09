import type * as Electron from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import { createUpdateService, type UpdateService } from '@electron/services/updater/service'
import type { Logger } from '@electron/services/logger'
import { applyWindowUpdateProgress } from '@electron/services/nativeUpdateProgress'
import type { UpdateEventPayload } from '@electron/types'
import type { DesktopNotificationServiceContract } from '@electron/services/desktopNotificationService'
import { detectUpdateCapability } from '@electron/services/updater/capability'

export type UpdaterIpcDependencies = {
  app: Electron.App
  BrowserWindow: typeof Electron.BrowserWindow
  desktopNotifications: DesktopNotificationServiceContract
  ipcMain: Electron.IpcMain
  logger: Logger
  onBeforeInstall?: () => Promise<void>
}

export const registerUpdatesIpc = ({
  app,
  BrowserWindow,
  desktopNotifications,
  ipcMain,
  logger,
  onBeforeInstall,
}: UpdaterIpcDependencies): UpdateService => {
  const capability = detectUpdateCapability({
    appImagePath: process.env.APPIMAGE,
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    resourcesPath: process.resourcesPath,
  })
  const updateService = createUpdateService({
    capability,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    logger: logger.child('updates'),
    onBeforeInstall,
    onEvent: (payload) => {
      sendUpdateEvent(BrowserWindow, payload)
      if (payload.event === 'downloaded') {
        notifyDownloadedUpdate(BrowserWindow, desktopNotifications, payload)
      }
    },
  })

  ipcMain.handle(nativeIpcChannels.updatesGetState, () => updateService.getState())
  ipcMain.handle(nativeIpcChannels.updatesCheck, () => updateService.checkForUpdates())
  ipcMain.handle(nativeIpcChannels.updatesDownload, () => updateService.downloadUpdate())
  ipcMain.handle(nativeIpcChannels.updatesInstall, () => updateService.installUpdate())
  ipcMain.handle(nativeIpcChannels.updatesSetInstallOnQuit, (_event, enabled: unknown) => {
    if (typeof enabled === 'boolean') return updateService.setInstallOnQuit(enabled)
    return {
      ...updateService.getState(),
      error: {
        code: 'INVALID_REQUEST' as const,
        message: 'Install-on-exit policy must be a boolean.',
        operation: 'install-on-quit' as const,
      },
      ok: false,
    }
  })
  updateService.startAutomaticChecks()

  return updateService
}

const notifyDownloadedUpdate = (
  BrowserWindow: typeof Electron.BrowserWindow,
  desktopNotifications: DesktopNotificationServiceContract,
  payload: UpdateEventPayload,
): void => {
  const owner = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
  desktopNotifications.show({
    body: payload.info?.version
      ? `Version ${payload.info.version} has been downloaded. Restart Marklab to install it.`
      : 'An update has been downloaded. Restart Marklab to install it.',
    category: 'update',
    id: 'update:downloaded',
    onClick: () => {
      if (!owner || owner.isDestroyed()) return
      owner.show()
      owner.focus()
    },
    ownerWebContentsId: owner?.webContents.id,
    title: 'Marklab update ready',
  })
}

const sendUpdateEvent = (
  BrowserWindow: typeof Electron.BrowserWindow,
  payload: UpdateEventPayload,
): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    applyWindowUpdateProgress(window, payload)
    window.webContents.send(nativeIpcChannels.updatesEvent, payload)
  }
}
