import { z } from 'zod'
import { invoke } from '@/runtime/ipc'

export const MAX_HTML_PREVIEW_BYTES = 512 * 1024
const resultSchema = z.object({ document: z.string().max(4 * 1024 * 1024) })

export const htmlPreviewApi = {
  async render(source: string, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    if (new TextEncoder().encode(source).byteLength > MAX_HTML_PREVIEW_BYTES) {
      throw new Error('HTML preview is limited to 512 KiB')
    }
    const result = await invoke('html_preview_render', { source })
    signal.throwIfAborted()
    return resultSchema.parse(result).document
  },
}
