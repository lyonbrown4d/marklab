import { getDesktopRuntime } from '@/runtime/desktop'

export const linkPreviewApi = {
  capture: (url: string) => getDesktopRuntime().linkPreview.capture(url),
  fetch: (url: string) => getDesktopRuntime().linkPreview.fetch(url),
}
