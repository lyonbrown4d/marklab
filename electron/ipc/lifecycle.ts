import type { IpcMain } from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import type { AppLaunchInfo } from '@electron/types'
export const registerLifecycleIpc = (
  ipcMain: IpcMain,
  getLaunchInfo: () => AppLaunchInfo,
): void => {
  ipcMain.handle(nativeIpcChannels.lifecycleGetLaunchInfo, () => getLaunchInfo())
}
