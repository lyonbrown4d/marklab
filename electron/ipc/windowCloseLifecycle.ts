import type * as Electron from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import type { WindowCloseFlushRequest, WindowCloseFlushResult } from '@electron/types'

const RENDERER_FLUSH_TIMEOUT_MS = 15_000

type PendingFlush = {
  reject: (error: Error) => void
  resolve: () => void
  senderId: number
  timeout: ReturnType<typeof setTimeout>
}

export type WindowCloseLifecycleIpcBridge = {
  requestRendererFlush: (window: Electron.BrowserWindow) => Promise<void>
}

const isFlushResult = (value: unknown): value is WindowCloseFlushResult => {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<WindowCloseFlushResult>
  return (
    Number.isSafeInteger(result.requestId) &&
    (result.ok === true ||
      (result.ok === false && typeof (result as { error?: unknown }).error === 'string'))
  )
}

export const registerWindowCloseLifecycleIpc = (
  ipcMain: Electron.IpcMain,
): WindowCloseLifecycleIpcBridge => {
  let nextRequestId = 1
  const pending = new Map<number, PendingFlush>()

  ipcMain.on(nativeIpcChannels.windowCloseFlushReady, (event, payload: unknown) => {
    if (!isFlushResult(payload)) return
    const request = pending.get(payload.requestId)
    if (!request || request.senderId !== event.sender.id) return
    pending.delete(payload.requestId)
    clearTimeout(request.timeout)
    if (payload.ok) request.resolve()
    else request.reject(new Error(payload.error))
  })

  return {
    requestRendererFlush: (window) => {
      if (window.isDestroyed()) return Promise.reject(new Error('Window is not available.'))
      const requestId = nextRequestId++
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(requestId)
          reject(new Error('Renderer did not finish saving before close.'))
        }, RENDERER_FLUSH_TIMEOUT_MS)
        pending.set(requestId, {
          reject,
          resolve,
          senderId: window.webContents.id,
          timeout,
        })
        const request: WindowCloseFlushRequest = { requestId }
        window.webContents.send(nativeIpcChannels.windowCloseFlushRequest, request)
      })
    },
  }
}
