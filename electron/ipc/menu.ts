import type * as Electron from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import { createMenuDispatchBridge, type MenuDispatchBridge } from '@electron/services/menuDispatch'
export const registerMenuDispatchIpc = (
  ipcMain: Electron.IpcMain,
  getFocusedWindow: () => Electron.BrowserWindow | null,
): MenuDispatchBridge => {
  ipcMain.handle(nativeIpcChannels.menuRendererReady, () => ({ ok: true }))
  return createMenuDispatchBridge(getFocusedWindow)
}
