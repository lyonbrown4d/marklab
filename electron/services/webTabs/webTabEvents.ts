import type { Event, Input, WebContents } from 'electron'
import { debounceTime, distinctUntilChanged, map, Subject, type Subscription } from 'rxjs'

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
  const denyWindowOpen = () => ({ action: 'deny' as const })
  const handleWindowOpen = ({ url }: { url: string }) => {
    let safeUrl = ''
    try {
      safeUrl = normalizeWebTabUrl(url)
    } catch {
      // Keep the URL hidden when it contains credentials or uses a denied scheme.
    }
    if (safeUrl) callbacks.onWindowOpen(safeUrl)
    return denyWindowOpen()
  }
  contents.setWindowOpenHandler(handleWindowOpen)
  const titleUpdates = createCoalescedUpdate(callbacks.onTitle, MAX_TITLE_LENGTH)
  const inPageUpdates = createCoalescedUpdate(callbacks.onNavigated, MAX_URL_LENGTH)
  const onInPageNavigation = (_event: Event, url: string) => {
    if (url.length <= MAX_URL_LENGTH) inPageUpdates.push(url)
  }
  const allowUnload = (event: Event) => event.preventDefault()
  const onNavigation = (_event: Event, url: string) => callbacks.onNavigated(url)
  const onTitle = (_event: Event, title: string) => titleUpdates.push(title)
  const onFailed = (
    _event: Event,
    code: number,
    description: string,
    _url: string,
    isMainFrame: boolean,
  ) => {
    if (isMainFrame && code !== -3) callbacks.onFailed(code, description)
  }
  const onCrashed = (_event: Event, details: { reason: string }) =>
    callbacks.onCrashed(details.reason)
  contents.on('did-start-loading', callbacks.onLoading)
  contents.on('before-input-event', callbacks.onInput)
  contents.on('did-finish-load', callbacks.onReady)
  contents.on('did-stop-loading', callbacks.onReady)
  contents.on('did-navigate', onNavigation)
  contents.on('did-navigate-in-page', onInPageNavigation)
  contents.on('page-title-updated', onTitle)
  contents.on('will-prevent-unload', allowUnload)
  contents.on('did-fail-load', onFailed)
  contents.on('render-process-gone', onCrashed)
  const cleanup = () => {
    titleUpdates.cleanup()
    inPageUpdates.cleanup()
    contents.removeListener('did-start-loading', callbacks.onLoading)
    contents.removeListener('before-input-event', callbacks.onInput)
    contents.removeListener('did-finish-load', callbacks.onReady)
    contents.removeListener('did-stop-loading', callbacks.onReady)
    contents.removeListener('did-navigate', onNavigation)
    contents.removeListener('did-navigate-in-page', onInPageNavigation)
    contents.removeListener('page-title-updated', onTitle)
    contents.removeListener('will-prevent-unload', allowUnload)
    contents.removeListener('did-fail-load', onFailed)
    contents.removeListener('render-process-gone', onCrashed)
    contents.removeListener('destroyed', cleanup)
    if (!contents.isDestroyed()) contents.setWindowOpenHandler(denyWindowOpen)
  }
  contents.once('destroyed', cleanup)
  return cleanup
}

const createCoalescedUpdate = (emit: (value: string) => void, maxLength: number) => {
  const updates = new Subject<string>()
  const subscription: Subscription = updates
    .pipe(
      map((value) => value.slice(0, maxLength)),
      distinctUntilChanged(),
      debounceTime(UPDATE_COALESCE_MS),
      distinctUntilChanged(),
    )
    .subscribe(emit)
  return {
    cleanup: () => subscription.unsubscribe(),
    push: (value: string) => updates.next(value),
  }
}
