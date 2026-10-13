import type { IpcRenderer } from 'electron'
import { nativeIpcChannels } from '@electron/channels'

// Cache the one-way native presentation notification before React subscribes.
// Standby renderers can finish loading before the window is acquired and shown.
export const createWindowPresentationPreloadSurface = (
  ipcRenderer: Pick<IpcRenderer, 'on'>,
): { onPresented: (handler: () => void) => () => void } => {
  let presented = false
  const listeners = new Set<() => void>()
  ipcRenderer.on(nativeIpcChannels.windowPresented, () => {
    presented = true
    for (const listener of listeners) listener()
  })
  return {
    onPresented: (handler) => {
      listeners.add(handler)
      if (presented) handler()
      return () => listeners.delete(handler)
    },
  }
}
