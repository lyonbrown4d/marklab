import { ipcRenderer, type IpcRenderer } from 'electron'

import { nativeIpcChannels } from '@electron/channels.js'
import type { ElectronLinkPreviewApi } from '@/runtime/electron.js'
import { linkPreviewResultSchema } from '@/types/linkPreview.js'

type LinkPreviewIpcRenderer = Pick<IpcRenderer, 'invoke'>

export const createLinkPreviewPreloadSurface = (
  renderer: LinkPreviewIpcRenderer = ipcRenderer,
): ElectronLinkPreviewApi => ({
  fetch: async (url) => {
    const result: unknown = await renderer.invoke(nativeIpcChannels.linkPreviewFetch, { url })
    const parsed = linkPreviewResultSchema.safeParse(result)
    if (!parsed.success) throw new Error('Invalid linkPreview.fetch response')
    return parsed.data
  },
})
