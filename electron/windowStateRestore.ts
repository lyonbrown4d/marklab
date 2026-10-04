import type { BrowserWindow } from 'electron'

export const restoreMaximizedOnFirstShow = (
  window: BrowserWindow,
  shouldMaximize: boolean,
): void => {
  if (!shouldMaximize) return
  window.once('show', () => {
    if (!window.isDestroyed()) window.maximize()
  })
}
