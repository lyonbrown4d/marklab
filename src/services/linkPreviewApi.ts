import { getElectronRuntime } from '@/runtime/electron'

export const linkPreviewApi = {
  fetch: (url: string) => getElectronRuntime().linkPreview.fetch(url),
}
