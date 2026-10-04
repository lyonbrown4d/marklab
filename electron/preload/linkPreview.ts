import { ipcRenderer, type IpcRenderer } from 'electron'

import { nativeIpcChannels } from '@electron/channels.js'
import type { ElectronLinkPreviewApi } from '@/runtime/electron.js'
import { linkPreviewCaptureSchema, linkPreviewResultSchema } from '@/types/linkPreview.js'

type LinkPreviewIpcRenderer = Pick<IpcRenderer, 'invoke'>

export const createLinkPreviewPreloadSurface = (
  renderer: LinkPreviewIpcRenderer = ipcRenderer,
): ElectronLinkPreviewApi => ({
  capture: async (url) => {
    const result: unknown = await renderer.invoke(nativeIpcChannels.linkPreviewCapture, { url })
    const parsed = linkPreviewCaptureSchema.safeParse(result)
    if (!parsed.success) throw new Error('Invalid linkPreview.capture response')
    return parsed.data
  },
  fetch: async (url) => {
    const result: unknown = await renderer.invoke(nativeIpcChannels.linkPreviewFetch, { url })
    const parsed = linkPreviewResultSchema.safeParse(result)
    if (!parsed.success) throw new Error('Invalid linkPreview.fetch response')
    return parsed.data
  },
})
