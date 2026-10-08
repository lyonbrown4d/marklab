import type { BrowserWindow } from 'electron'

const SPLASH_DISMISS_FALLBACK_MS = 400

type HideWindow = (window: BrowserWindow, onHidden: () => void) => void

export const showSplashWithoutActivation = (splash: BrowserWindow): void => {
  if (splash.isDestroyed() || splash.isVisible()) return
  splash.showInactive()
}

export const dismissSplashWindow = (splash: BrowserWindow, hideWindow: HideWindow): void => {
  if (splash.isDestroyed()) return
  const fallback = setTimeout(() => {
    if (!splash.isDestroyed()) splash.destroy()
  }, SPLASH_DISMISS_FALLBACK_MS)
  splash.once('closed', () => clearTimeout(fallback))
  hideWindow(splash, () => {
    if (!splash.isDestroyed()) splash.destroy()
  })
}
