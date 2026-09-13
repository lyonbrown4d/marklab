import { nativeImage, type Clipboard, type IpcMain } from 'electron'
import { Buffer } from 'node:buffer'
import { nativeIpcChannels } from '@electron/channels.js'
import type { ClipboardImage } from '@electron/types.js'
export const registerClipboardIpc = (
  ipcMain: Pick<IpcMain, 'handle'>,
  clipboard: Pick<Clipboard, 'read' | 'readText' | 'writeText'>,
): void => {
  ipcMain.handle(nativeIpcChannels.clipboardReadText, () => clipboard.readText())
  ipcMain.handle(nativeIpcChannels.clipboardWriteText, async (_event, text: unknown) => {
    await clipboard.writeText(typeof text === 'string' ? text : '')
    return { ok: true }
  })
  ipcMain.handle(nativeIpcChannels.clipboardReadImage, async (): Promise<ClipboardImage | null> => {
    const items = await clipboard.read()
    const png = items.find((item) => item.types.includes('image/png'))
    const item = png ?? items.find((candidate) => candidate.types.includes('image/jpeg'))
    if (!item) return null
    const blob = await item.getType(png ? 'image/png' : 'image/jpeg')
    if (
      !blob ||
      typeof blob !== 'object' ||
      !('arrayBuffer' in blob) ||
      typeof blob.arrayBuffer !== 'function'
    )
      return null
    const image = nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer()))
    if (image.isEmpty()) return null
    const size = image.getSize()
    return {
      dataUrl: image.toDataURL(),
      width: size.width,
      height: size.height,
    }
  })
}
