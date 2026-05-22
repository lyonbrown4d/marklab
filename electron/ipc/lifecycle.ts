import type { IpcMain } from 'electron'
import { nativeIpcChannels } from '@electron/channels.js'
import type { AppLaunchInfo } from '@electron/types.js'
const LEGACY_LAUNCH_CHANNEL = 'marko:lifecycle:get-launch-info'
export const registerLifecycleIpc = (
  ipcMain: IpcMain,
  getLaunchInfo: () => AppLaunchInfo,
): void => {
  ipcMain.handle(nativeIpcChannels.lifecycleGetLaunchInfo, () => getLaunchInfo())
  ipcMain.handle(LEGACY_LAUNCH_CHANNEL, () => getLaunchInfo())
}
