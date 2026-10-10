import type { BrowserWindow } from 'electron'

const SPLASH_DISMISS_FALLBACK_MS = 400

type HideWindow = (window: BrowserWindow, onHidden: () => void) => void

export const showSplashWithoutActivation = (splash: BrowserWindow): void => {
  if (splash.isDestroyed() || splash.isVisible()) return
  splash.showInactive()
}

export const dismissSplashWindow = (
  splash: BrowserWindow,
  hideWindow: HideWindow,
  onDismissed?: () => void,
): void => {
  if (splash.isDestroyed()) {
    onDismissed?.()
    return
  }

  let completed = false
  const complete = (): void => {
    if (completed) return
    completed = true
    clearTimeout(fallback)
    if (!splash.isDestroyed()) splash.destroy()
    onDismissed?.()
  }
  const fallback = setTimeout(complete, SPLASH_DISMISS_FALLBACK_MS)
  splash.once('closed', complete)
  hideWindow(splash, complete)
}
