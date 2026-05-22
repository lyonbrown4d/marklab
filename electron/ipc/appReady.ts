import type { App, IpcMain } from 'electron'
import { nativeIpcChannels } from '@electron/channels.js'
export const registerAppReadyIpc = (
  ipcMain: IpcMain,
  app: App,
  onRendererReady?: () => void,
): void => {
  ipcMain.handle(nativeIpcChannels.appReadySignal, () => {
    onRendererReady?.()
    return { ok: true }
  })
  ipcMain.handle(nativeIpcChannels.appReadyIsReady, () => app.isReady())
  ipcMain.handle(nativeIpcChannels.appReadyWhenReady, async () => {
    await app.whenReady()
    return { ok: true }
  })
}
