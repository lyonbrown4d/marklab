import type { BrowserWindow } from 'electron'
import type { DeepLinkPayload, SingleInstancePayload } from '@electron/types.js'

export type PendingRuntimeEvent =
  | { eventName: 'single-instance'; payload: SingleInstancePayload }
  | { eventName: 'deep-link'; payload: DeepLinkPayload }

export type RuntimeEventQueue = {
  flushPendingRuntimeEvents: () => void
  queueDeepLinkPayload: (payload: DeepLinkPayload) => void
  queueOrSendRuntimeEvent: (event: PendingRuntimeEvent) => void
}

export const createRuntimeEventQueue = (
  getMainWindow: () => BrowserWindow | null,
): RuntimeEventQueue => {
  const pendingRuntimeEvents: PendingRuntimeEvent[] = []

  const sendRendererEvent = (eventName: string, payload: unknown): boolean => {
    const main = getMainWindow()
    if (!main || main.isDestroyed()) return false
    main.webContents.send(eventName, payload)
    return true
  }

  const queueOrSendRuntimeEvent = (event: PendingRuntimeEvent): void => {
    if (sendRendererEvent(event.eventName, event.payload)) return
    pendingRuntimeEvents.push(event)
  }

  const queueDeepLinkPayload = (payload: DeepLinkPayload): void => {
    queueOrSendRuntimeEvent({ eventName: 'deep-link', payload })
  }

  const flushPendingRuntimeEvents = (): void => {
    while (pendingRuntimeEvents.length > 0) {
      const event = pendingRuntimeEvents[0]
      if (!event || !sendRendererEvent(event.eventName, event.payload)) return
      pendingRuntimeEvents.shift()
    }
  }

  return {
    flushPendingRuntimeEvents,
    queueDeepLinkPayload,
    queueOrSendRuntimeEvent,
  }
}
