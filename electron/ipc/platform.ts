import type { IpcMain } from 'electron'

import { nativeIpcChannels } from '../channels.js'
import { getPlatformInfo } from '../services/platform.js'

export function registerPlatformIpc(ipcMain: IpcMain): void {
  ipcMain.handle(nativeIpcChannels.platformGet, () => getPlatformInfo())
}
