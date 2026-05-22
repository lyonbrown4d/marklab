import type * as Electron from 'electron'
import { nativeIpcChannels } from '@electron/channels.js'
import type { MenuCommandPayload } from '@electron/types.js'
export type MenuDispatchBridge = {
  dispatchToFocusedWindow: (command: string, payload?: unknown) => boolean
  dispatchToWindow: (window: Electron.BrowserWindow, command: string, payload?: unknown) => boolean
}
export const createMenuDispatchBridge = (
  getFocusedWindow: () => Electron.BrowserWindow | null,
): MenuDispatchBridge => {
  const dispatchToWindow = (
    window: Electron.BrowserWindow,
    command: string,
    payload?: unknown,
  ): boolean => {
    if (!command || window.isDestroyed()) return false
    const message: MenuCommandPayload = { command, payload }
    window.webContents.send(nativeIpcChannels.menuCommand, message)
    return true
  }
  return {
    dispatchToFocusedWindow(command, payload) {
      const focusedWindow = getFocusedWindow()
      if (!focusedWindow) return false
      return dispatchToWindow(focusedWindow, command, payload)
    },
    dispatchToWindow,
  }
}
