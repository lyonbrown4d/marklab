import type { BrowserWindow } from 'electron'

import type {
  WebTabEntry,
  WebTabWindowState,
} from '@electron/services/webTabs/webTabManagerTypes.js'

export const installWebTabWindowListeners = (
  owner: BrowserWindow,
  callbacks: { close: () => void; resume: () => void; suspend: () => void },
): (() => void) => {
  owner.on('hide', callbacks.suspend)
  owner.on('minimize', callbacks.suspend)
  owner.on('show', callbacks.resume)
  owner.on('restore', callbacks.resume)
  owner.once('closed', callbacks.close)
  return () => {
    owner.removeListener('hide', callbacks.suspend)
    owner.removeListener('minimize', callbacks.suspend)
    owner.removeListener('show', callbacks.resume)
    owner.removeListener('restore', callbacks.resume)
    owner.removeListener('closed', callbacks.close)
  }
}

export const disposeWebTabWindow = (
  state: WebTabWindowState,
  destroyEntry: (entry: WebTabEntry) => void,
): void => {
  state.cleanup()
  for (const entry of [...state.entries.values()]) destroyEntry(entry)
}
