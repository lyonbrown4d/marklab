import type { Event, Input, WebContents } from 'electron'

import { normalizeWebTabUrl } from '@electron/services/webTabs/webTabUrl.js'

type WebTabEventCallbacks = {
  onCrashed: (description: string) => void
  onFailed: (code: number, description: string) => void
  onLoading: () => void
  onInput: (event: Event, input: Input) => void
  onNavigated: (url: string) => void
  onReady: () => void
  onTitle: (title: string) => void
  onWindowOpen: (url: string) => void
}

const MAX_TITLE_LENGTH = 512
const MAX_URL_LENGTH = 4096
const UPDATE_COALESCE_MS = 250

export const installWebTabEvents = (
  contents: WebContents,
  callbacks: WebTabEventCallbacks,
): (() => void) => {
  contents.setWindowOpenHandler(({ url }) => {
    let safeUrl = ''
    try {
      safeUrl = normalizeWebTabUrl(url)
    } catch {
      // Keep the URL hidden when it contains credentials or uses a denied scheme.
    }
    if (safeUrl) callbacks.onWindowOpen(safeUrl)
    return { action: 'deny' }
  })
  const titleUpdates = createCoalescedUpdate(callbacks.onTitle, MAX_TITLE_LENGTH)
  const inPageUpdates = createCoalescedUpdate(callbacks.onNavigated, MAX_URL_LENGTH)
  const onInPageNavigation = (_event: Event, url: string) => {
    if (url.length <= MAX_URL_LENGTH) inPageUpdates.push(url)
  }
  const allowUnload = (event: Event) => event.preventDefault()
  contents.on('did-start-loading', callbacks.onLoading)
  contents.on('before-input-event', callbacks.onInput)
  contents.on('did-finish-load', callbacks.onReady)
  contents.on('did-stop-loading', callbacks.onReady)
  contents.on('did-navigate', (_event, url) => callbacks.onNavigated(url))
  contents.on('did-navigate-in-page', onInPageNavigation)
  contents.on('page-title-updated', (_event, title) => titleUpdates.push(title))
  contents.on('will-prevent-unload', allowUnload)
  contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) callbacks.onFailed(code, description)
  })
  contents.on('render-process-gone', (_event, details) => callbacks.onCrashed(details.reason))
  const cleanup = () => {
    titleUpdates.cleanup()
    inPageUpdates.cleanup()
    contents.removeListener('before-input-event', callbacks.onInput)
    contents.removeListener('did-navigate-in-page', onInPageNavigation)
    contents.removeListener('will-prevent-unload', allowUnload)
    contents.removeListener('destroyed', cleanup)
  }
  contents.once('destroyed', cleanup)
  return cleanup
}

const createCoalescedUpdate = (emit: (value: string) => void, maxLength: number) => {
  let lastValue: string | null = null
  let pendingValue: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const push = (value: string): void => {
    const bounded = value.slice(0, maxLength)
    if (bounded === pendingValue) return
    pendingValue = bounded
    if (timer) clearTimeout(timer)
    if (bounded === lastValue) {
      timer = null
      pendingValue = null
      return
    }
    timer = setTimeout(() => {
      timer = null
      if (pendingValue === null) return
      lastValue = pendingValue
      pendingValue = null
      emit(lastValue)
    }, UPDATE_COALESCE_MS)
  }
  const cleanup = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    pendingValue = null
  }
  return { cleanup, push }
}
