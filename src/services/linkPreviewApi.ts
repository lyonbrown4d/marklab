import { getElectronRuntime } from '@/runtime/electron'

export const linkPreviewApi = {
  capture: (url: string) => getElectronRuntime().linkPreview.capture(url),
  fetch: (url: string) => getElectronRuntime().linkPreview.fetch(url),
}
