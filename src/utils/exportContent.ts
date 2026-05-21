import { APP_EVENT, emitAppEvent, onAppEvent, type AppEventMap } from '@/utils/appEvents'
export const EXPORT_CONTENT_EVENT = APP_EVENT.exportContent
export type ExportContentRequest = AppEventMap[typeof EXPORT_CONTENT_EVENT]
export const onExportContentRequest = (handler: (request: ExportContentRequest) => void) => {
  return onAppEvent(EXPORT_CONTENT_EVENT, handler)
}
/** Request the current editor content. Resolves with fallback after timeout if no response. */
export const requestExportContent = (
  fallback: string,
  options?: {
    expectedActivePath?: string | null
    timeoutMs?: number
  },
): Promise<string> => {
  const { expectedActivePath = null, timeoutMs = 150 } = options ?? {}
  return new Promise((resolve) => {
    let resolved = false
    const respond = (content: string) => {
      if (!resolved) {
        resolved = true
        resolve(content)
      }
    }
    emitAppEvent(EXPORT_CONTENT_EVENT, { expectedActivePath, respond })
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        resolve(fallback)
      }
    }, timeoutMs)
  })
}
