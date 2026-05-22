import type { IpcMain } from 'electron'
import { nativeIpcChannels } from '@electron/channels.js'
import { getPlatformInfo } from '@electron/services/platform.js'
export const registerPlatformIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle(nativeIpcChannels.platformGet, () => getPlatformInfo())
}
