import type { IpcMain } from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import { getPlatformInfo } from '@electron/services/platform'
export const registerPlatformIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle(nativeIpcChannels.platformGet, () => getPlatformInfo())
}
