import type * as Electron from 'electron'

import { nativeIpcChannels } from '../channels.js'
import type { StartDragResult, WindowActionResult } from '../types.js'

function windowFromEvent(
  event: Electron.IpcMainInvokeEvent,
  BrowserWindowCtor: typeof Electron.BrowserWindow,
): Electron.BrowserWindow | null {
  return BrowserWindowCtor.fromWebContents(event.sender)
}

function withWindow(
  event: Electron.IpcMainInvokeEvent,
  BrowserWindowCtor: typeof Electron.BrowserWindow,
  action: (window: Electron.BrowserWindow) => void,
): WindowActionResult {
  const window = windowFromEvent(event, BrowserWindowCtor)
  if (!window || window.isDestroyed()) {
    return { ok: false, error: 'Window is not available.' }
  }

  action(window)
  return { ok: true }
}

export function registerWindowControlsIpc(
  ipcMain: Electron.IpcMain,
  BrowserWindowCtor: typeof Electron.BrowserWindow,
): void {
  ipcMain.handle(nativeIpcChannels.windowMinimize, (event) =>
    withWindow(event, BrowserWindowCtor, (window) => window.minimize()),
  )

  ipcMain.handle(nativeIpcChannels.windowMaximize, (event) =>
    withWindow(event, BrowserWindowCtor, (window) => window.maximize()),
  )

  ipcMain.handle(nativeIpcChannels.windowUnmaximize, (event) =>
    withWindow(event, BrowserWindowCtor, (window) => window.unmaximize()),
  )

  ipcMain.handle(nativeIpcChannels.windowClose, (event) =>
    withWindow(event, BrowserWindowCtor, (window) => window.close()),
  )

  ipcMain.handle(nativeIpcChannels.windowIsMaximized, (event) => {
    const window = windowFromEvent(event, BrowserWindowCtor)
    return Boolean(window && !window.isDestroyed() && window.isMaximized())
  })

  ipcMain.handle(nativeIpcChannels.windowStartDrag, (): StartDragResult => {
    return {
      ok: false,
      supported: false,
      error:
        'Programmatic window dragging is not supported by this Electron bridge. Use app-region drag zones.',
    }
  })
}
