import type { BrowserWindow } from 'electron'
import {
  hideWindowWithMotion,
  notifyWindowPresented,
  showWindowWithMotion,
} from '@electron/windowMotion'
import { isBackgroundElectronE2e } from '@electron/main/e2eRuntime'

const SPLASH_DISMISS_FALLBACK_MS = 400
const MAIN_SHOW_FALLBACK_MS = 1000

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
  let destroyRequested = false
  const cleanup = (): void => {
    completed = true
    clearTimeout(fallback)
    splash.removeListener('closed', complete)
  }
  const complete = (): void => {
    if (completed) return
    cleanup()
    onDismissed?.()
  }
  const destroy = (): void => {
    if (completed || destroyRequested) return
    destroyRequested = true
    clearTimeout(fallback)
    // Completion belongs to `closed`, which can arrive after destroy() returns.
    if (splash.isDestroyed()) return
    try {
      splash.destroy()
    } catch {
      // Release lifecycle listeners without claiming a presentation before closed.
      cleanup()
    }
  }
  const fallback = setTimeout(destroy, SPLASH_DISMISS_FALLBACK_MS)
  splash.once('closed', complete)
  try {
    hideWindow(splash, destroy)
  } catch {
    destroy()
  }
}

export const revealMainWindowFromSplash = (main: BrowserWindow, splash: BrowserWindow): void => {
  if (main.isDestroyed()) {
    dismissSplashWindow(splash, hideWindowWithMotion)
    return
  }
  const notifyPresented = () => {
    if (!main.isDestroyed() && (main.isVisible() || isBackgroundElectronE2e())) {
      notifyWindowPresented(main)
    }
  }
  if (main.isVisible() || isBackgroundElectronE2e()) {
    try {
      showWindowWithMotion(main, { focus: true, deferPresentation: true })
    } catch {
      // The already visible surface still replaces the splash if focus fails.
    }
    dismissSplashWindow(splash, hideWindowWithMotion, notifyPresented)
    return
  }

  let completed = false
  const dismiss = () => {
    if (completed) return
    completed = true
    clearTimeout(fallback)
    main.removeListener('show', dismiss)
    main.removeListener('closed', dismiss)
    dismissSplashWindow(splash, hideWindowWithMotion, notifyPresented)
  }
  const fallback = setTimeout(dismiss, MAIN_SHOW_FALLBACK_MS)
  // show() can return before the native surface is shown. Keep the splash until
  // the actual event, so even a delayed native reveal cannot leave a blank gap.
  main.once('show', dismiss)
  main.once('closed', dismiss)
  try {
    showWindowWithMotion(main, { focus: true, deferPresentation: true })
  } catch {
    dismiss()
  }
}
