import { ClipboardItem, nativeImage, type Clipboard, type IpcMain } from 'electron'
import { Buffer } from 'node:buffer'
import { nativeIpcChannels } from '@electron/channels'
import type { ClipboardImage } from '@electron/types'
export const registerClipboardIpc = (
  ipcMain: Pick<IpcMain, 'handle'>,
  clipboard: Pick<Clipboard, 'read' | 'readText' | 'write' | 'writeText'>,
): void => {
  ipcMain.handle(nativeIpcChannels.clipboardReadText, () => clipboard.readText())
  ipcMain.handle(nativeIpcChannels.clipboardWrite, async (_event, input: unknown) => {
    if (
      !input ||
      typeof input !== 'object' ||
      !('text' in input) ||
      typeof input.text !== 'string' ||
      !('markdown' in input) ||
      typeof input.markdown !== 'string' ||
      ('html' in input && input.html !== undefined && typeof input.html !== 'string')
    ) {
      throw new TypeError('Invalid clipboard write payload.')
    }

    const html = 'html' in input ? input.html : undefined
    await clipboard.write([
      new ClipboardItem({
        'text/plain': input.text,
        'text/markdown': input.markdown,
        ...(typeof html === 'string' && html ? { 'text/html': html } : {}),
      }),
    ])
    return { ok: true }
  })
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
