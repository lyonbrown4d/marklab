import { BrowserWindow, ipcMain } from 'electron'
import type { NativeIpcRegistration } from '@electron/ipc/index'
import type { RendererReadySignal } from '@/types/rendererReady'
import { parseRendererReadySignal } from '@electron/ipc/appReady'

type LegacyShellIpcOptions = {
  getMainWindow: () => BrowserWindow | null
  getNativeIpc: () => NativeIpcRegistration | null
  onRendererReady: (event: Electron.IpcMainInvokeEvent, signal: RendererReadySignal) => void
}

type LegacyShellIpcRegistration = {
  register: () => void
}

export const createLegacyShellIpcRegistration = (
  options: LegacyShellIpcOptions,
): LegacyShellIpcRegistration => {
  let registered = false

  const register = (): void => {
    if (registered) return
    registered = true

    ipcMain.handle('app-ready', (event, payload: unknown) => {
      options.onRendererReady(event, parseRendererReadySignal(payload))
      return { ok: true }
    })

    ipcMain.handle('app_get_platform', () => {
      if (process.platform === 'win32') return 'windows'
      if (process.platform === 'darwin') return 'macos'
      if (process.platform === 'linux') return 'linux'
      return 'unknown'
    })

    ipcMain.handle('menu_dispatch', (_event, payload: { id?: unknown }) => {
      if (typeof payload?.id !== 'string') {
        throw new Error('menu_dispatch requires an id string')
      }
      const target = BrowserWindow.getFocusedWindow() ?? options.getMainWindow()
      if (target && options.getNativeIpc()?.menu.dispatchToWindow(target, payload.id)) {
        return { ok: true }
      }
      target?.webContents.send('menu-action', payload.id)
      return { ok: true }
    })
  }

  return { register }
}
