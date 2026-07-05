import type * as Electron from 'electron'
import { nativeIpcChannels } from '@electron/channels.js'
import { createUpdateService, type UpdateService } from '@electron/services/updater/service.js'
import type { Logger } from '@electron/services/logger.js'
import { applyWindowUpdateProgress } from '@electron/services/nativeUpdateProgress.js'
import type { UpdateEventPayload } from '@electron/types.js'

export type UpdaterIpcDependencies = {
  app: Electron.App
  BrowserWindow: typeof Electron.BrowserWindow
  ipcMain: Electron.IpcMain
  logger: Logger
  onBeforeInstall?: () => Promise<void>
}

export const registerUpdatesIpc = ({
  app,
  BrowserWindow,
  ipcMain,
  logger,
  onBeforeInstall,
}: UpdaterIpcDependencies): UpdateService => {
  const updateService = createUpdateService({
    isPackaged: app.isPackaged,
    logger: logger.child('updates'),
    onBeforeInstall,
    onEvent: (payload) => sendUpdateEvent(BrowserWindow, payload),
  })

  ipcMain.handle(nativeIpcChannels.updatesGetState, () => updateService.getState())
  ipcMain.handle(nativeIpcChannels.updatesCheck, () => updateService.checkForUpdates())
  ipcMain.handle(nativeIpcChannels.updatesDownload, () => updateService.downloadUpdate())
  ipcMain.handle(nativeIpcChannels.updatesInstall, () => updateService.installUpdate())

  return updateService
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
