import type { IpcMain } from 'electron'
import { nativeIpcChannels } from '@electron/channels.js'
import type { AppLaunchInfo } from '@electron/types.js'
export const registerLifecycleIpc = (
  ipcMain: IpcMain,
  getLaunchInfo: () => AppLaunchInfo,
): void => {
  ipcMain.handle(nativeIpcChannels.lifecycleGetLaunchInfo, () => getLaunchInfo())
}
