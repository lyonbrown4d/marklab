import type { BrowserWindow } from 'electron'

// Optional analysis follows native window activity independently of buffer persistence.
export const bindWindowWorkspaceAnalysisForeground = (
  window: BrowserWindow,
  setForeground: (foreground: boolean) => void,
): (() => void) => {
  const resume = (): void => {
    setForeground(
      !window.isDestroyed() &&
        (window.isFocused?.() ?? true) &&
        (window.isVisible?.() ?? true) &&
        !(window.isMinimized?.() ?? false),
    )
  }
  const suspend = (): void => setForeground(false)
  window.on('focus', resume)
  window.on('show', resume)
  window.on('restore', resume)
  window.on('blur', suspend)
  window.on('hide', suspend)
  window.on('minimize', suspend)
  resume()
  return () => {
    window.removeListener('focus', resume)
    window.removeListener('show', resume)
    window.removeListener('restore', resume)
    window.removeListener('blur', suspend)
    window.removeListener('hide', suspend)
    window.removeListener('minimize', suspend)
    suspend()
  }
}
