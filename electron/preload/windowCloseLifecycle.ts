import type { IpcRenderer, IpcRendererEvent } from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import type { WindowCloseFlushRequest, WindowCloseFlushResult } from '@electron/types'

export type WindowCloseLifecyclePreloadSurface = {
  onCloseRequested: (handler: () => Promise<void> | void) => () => void
}

const isFlushRequest = (value: unknown): value is WindowCloseFlushRequest =>
  Boolean(
    value &&
    typeof value === 'object' &&
    Number.isSafeInteger((value as Partial<WindowCloseFlushRequest>).requestId),
  )

export const createWindowCloseLifecyclePreloadSurface = (
  ipcRenderer: Pick<IpcRenderer, 'on' | 'removeListener' | 'send'>,
): WindowCloseLifecyclePreloadSurface => ({
  onCloseRequested: (handler) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => {
      if (!isFlushRequest(payload)) return
      void Promise.resolve()
        .then(handler)
        .then(
          () => ({ ok: true, requestId: payload.requestId }) satisfies WindowCloseFlushResult,
          (error: unknown) =>
            ({
              error: error instanceof Error ? error.message : String(error),
              ok: false,
              requestId: payload.requestId,
            }) satisfies WindowCloseFlushResult,
        )
        .then((result) => ipcRenderer.send(nativeIpcChannels.windowCloseFlushReady, result))
    }
    ipcRenderer.on(nativeIpcChannels.windowCloseFlushRequest, listener)
    return () => ipcRenderer.removeListener(nativeIpcChannels.windowCloseFlushRequest, listener)
  },
})
