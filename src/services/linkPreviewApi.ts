import { getDesktopRuntime } from '@/runtime/desktop'
import type { PreviewCapturePriority } from '@/types/linkPreview'

type CaptureOptions = { priority?: PreviewCapturePriority; signal?: AbortSignal }
const requests = new Map<string, Set<string>>()
const cancelRequest = (requestId: string) => getDesktopRuntime().linkPreview.cancel(requestId)
const cancelled = () =>
  Object.assign(new Error('Web preview capture was cancelled'), { code: 'PREVIEW_CANCELLED' })

const capture = async (url: string, { priority = 'interactive', signal }: CaptureOptions = {}) => {
  if (signal?.aborted) throw cancelled()
  const requestId = crypto.randomUUID()
  const active = requests.get(url) ?? new Set<string>()
  requests.set(url, active)
  active.add(requestId)
  const abort = () => {
    void cancelRequest(requestId).catch(() => undefined)
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    return await getDesktopRuntime().linkPreview.capture(url, { priority, requestId })
  } finally {
    signal?.removeEventListener('abort', abort)
    active.delete(requestId)
    if (active.size === 0 && requests.get(url) === active) requests.delete(url)
  }
}

export const linkPreviewApi = {
  capture,
  cancel: (url: string) =>
    Promise.all([...(requests.get(url) ?? [])].map(cancelRequest)).then(() => undefined),
  fetch: (url: string) => getDesktopRuntime().linkPreview.fetch(url),
  promote: (url: string) =>
    Promise.all(
      [...(requests.get(url) ?? [])].map((id) => getDesktopRuntime().linkPreview.promote(id)),
    ).then(() => undefined),
}
