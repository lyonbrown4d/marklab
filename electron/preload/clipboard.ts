import { ipcRenderer, type IpcRenderer } from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import type { ClipboardImage } from '@electron/types'
import type { ElectronClipboardApi } from '@/runtime/electron'

export const createClipboardPreloadSurface = (
  renderer: Pick<IpcRenderer, 'invoke'>,
): ElectronClipboardApi => ({
  readText: () => renderer.invoke(nativeIpcChannels.clipboardReadText) as Promise<string>,
  write: (content) =>
    renderer.invoke(nativeIpcChannels.clipboardWrite, content) as Promise<{ ok: boolean }>,
  writeText: (text) =>
    renderer.invoke(nativeIpcChannels.clipboardWriteText, text) as Promise<{ ok: boolean }>,
  readImage: () =>
    renderer.invoke(nativeIpcChannels.clipboardReadImage) as Promise<ClipboardImage | null>,
})

export const clipboardPreloadSurface = createClipboardPreloadSurface(ipcRenderer)
