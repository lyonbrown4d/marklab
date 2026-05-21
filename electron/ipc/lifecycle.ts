import type { IpcMain } from 'electron'
import { nativeIpcChannels } from '../channels.js'
import type { AppLaunchInfo } from '../types.js'
export const registerLifecycleIpc = (
  ipcMain: IpcMain,
  getLaunchInfo: () => AppLaunchInfo,
): void => {
  ipcMain.handle(nativeIpcChannels.lifecycleGetLaunchInfo, () => getLaunchInfo())
}
