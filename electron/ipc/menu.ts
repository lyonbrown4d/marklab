import type * as Electron from 'electron'
import { nativeIpcChannels } from '../channels.js'
import { createMenuDispatchBridge, type MenuDispatchBridge } from '../services/menuDispatch.js'
export const registerMenuDispatchIpc = (
  ipcMain: Electron.IpcMain,
  getFocusedWindow: () => Electron.BrowserWindow | null,
): MenuDispatchBridge => {
  ipcMain.handle(nativeIpcChannels.menuRendererReady, () => ({ ok: true }))
  return createMenuDispatchBridge(getFocusedWindow)
}
