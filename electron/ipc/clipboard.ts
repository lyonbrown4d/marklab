import type { Clipboard, IpcMain } from 'electron'

import { nativeIpcChannels } from '../channels.js'
import type { ClipboardImage } from '../types.js'

export function registerClipboardIpc(ipcMain: IpcMain, clipboard: Clipboard): void {
  ipcMain.handle(nativeIpcChannels.clipboardReadText, () => clipboard.readText())

  ipcMain.handle(nativeIpcChannels.clipboardWriteText, (_event, text: unknown) => {
    clipboard.writeText(typeof text === 'string' ? text : '')
    return { ok: true }
  })

  ipcMain.handle(nativeIpcChannels.clipboardReadImage, (): ClipboardImage | null => {
    const image = clipboard.readImage()
    if (image.isEmpty()) return null

    const size = image.getSize()
    return {
      dataUrl: image.toDataURL(),
      width: size.width,
      height: size.height,
    }
  })
}
