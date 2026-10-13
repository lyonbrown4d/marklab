import { systemPreferences, type BrowserWindow } from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import { isBackgroundElectronE2e } from '@electron/main/e2eRuntime'

const SHOW_DURATION_MS = 120
const HIDE_DURATION_MS = 160
const FRAME_MS = 16
const DRAG_OPACITY = 0.85
const MAC_MOVE_IDLE_MS = 180
const PRESENTATION_FALLBACK_MS = 1000

const activeMotions = new WeakMap<BrowserWindow, () => void>()
const dragRestorers = new WeakMap<BrowserWindow, () => void>()
const pendingPresentations = new WeakMap<BrowserWindow, () => void>()

export const notifyWindowPresented = (window: BrowserWindow): void => {
  try {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send(nativeIpcChannels.windowPresented)
  } catch {
    // A renderer may exit between the destruction check and native delivery.
  }
}

const waitForWindowPresentation = (window: BrowserWindow): void => {
  let completed = false
  const cleanup = () => {
    if (completed) return
    completed = true
    clearTimeout(fallback)
    window.removeListener('show', presented)
    window.removeListener('closed', cleanup)
    window.removeListener('hide', cleanup)
    pendingPresentations.delete(window)
  }
  const presented = () => {
    if (completed) return
    cleanup()
    notifyWindowPresented(window)
  }
  const fallback = setTimeout(() => {
    if (!window.isDestroyed() && window.isVisible()) presented()
    else cleanup()
  }, PRESENTATION_FALLBACK_MS)
  pendingPresentations.set(window, cleanup)
  window.once('show', presented)
  window.once('closed', cleanup)
  window.once('hide', cleanup)
}

const stopWindowMotion = (window: BrowserWindow): void => {
  activeMotions.get(window)?.()
}

const supportsWindowOpacity = (): boolean =>
  process.platform === 'darwin' || process.platform === 'win32'

const shouldAnimateWindow = (): boolean => {
  if (!supportsWindowOpacity()) return false
  try {
    const settings = systemPreferences.getAnimationSettings()
    return !settings.prefersReducedMotion && settings.shouldRenderRichAnimation
  } catch {
    return false
  }
}

const setOpacitySafely = (window: BrowserWindow, opacity: number): boolean => {
  if (window.isDestroyed()) return false
  try {
    window.setOpacity(opacity)
    return true
  } catch {
    return false
  }
}

const animateWindowOpacity = ({
  window,
  from,
  to,
  durationMs,
  easeOut = false,
  onComplete,
}: {
  window: BrowserWindow
  from: number
  to: number
  durationMs: number
  easeOut?: boolean
  onComplete: () => void
}): void => {
  stopWindowMotion(window)

  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const stop = () => {
    stopped = true
    if (timer) clearTimeout(timer)
    window.removeListener('closed', complete)
    activeMotions.delete(window)
  }
  const complete = () => {
    if (stopped) return
    stop()
    onComplete()
  }
  activeMotions.set(window, stop)
  window.once('closed', complete)
  const startedAt = Date.now()
  const step = () => {
    if (stopped) return
    if (window.isDestroyed()) {
      complete()
      return
    }

    const elapsed = Date.now() - startedAt
    const progress = Math.min(1, elapsed / durationMs)
    const easedProgress = easeOut ? 1 - (1 - progress) ** 3 : progress
    const opacity = from + (to - from) * easedProgress
    if (!setOpacitySafely(window, opacity)) {
      complete()
      return
    }

    if (progress >= 1) {
      complete()
      return
    }

    timer = setTimeout(step, FRAME_MS)
  }

  step()
}

export const showWindowWithMotion = (
  window: BrowserWindow,
  options: { focus?: boolean; deferPresentation?: boolean } = {},
) => {
  if (window.isDestroyed()) {
    pendingPresentations.get(window)?.()
    return
  }
  dragRestorers.get(window)?.()
  stopWindowMotion(window)
  pendingPresentations.get(window)?.()
  if (isBackgroundElectronE2e()) {
    if (supportsWindowOpacity()) setOpacitySafely(window, 1)
    if (!options.deferPresentation) notifyWindowPresented(window)
    return
  }

  if (window.isVisible()) {
    if (supportsWindowOpacity()) setOpacitySafely(window, 1)
    if (!options.deferPresentation) notifyWindowPresented(window)
    if (options.focus) window.focus()
    return
  }

  const canAnimate = shouldAnimateWindow() && setOpacitySafely(window, 0)
  if (!canAnimate && supportsWindowOpacity()) setOpacitySafely(window, 1)
  if (!options.deferPresentation) waitForWindowPresentation(window)
  try {
    window.show()
    if (window.isDestroyed()) {
      pendingPresentations.get(window)?.()
      return
    }
    if (options.focus) window.focus()
  } catch (error) {
    pendingPresentations.get(window)?.()
    if (supportsWindowOpacity()) setOpacitySafely(window, 1)
    throw error
  }

  if (!canAnimate || window.isDestroyed()) return
  animateWindowOpacity({
    window,
    from: 0,
    to: 1,
    durationMs: SHOW_DURATION_MS,
    easeOut: true,
    onComplete: () => {
      setOpacitySafely(window, 1)
    },
  })
}

export const hideWindowWithMotion = (window: BrowserWindow, onHidden?: () => void) => {
  if (window.isDestroyed()) {
    pendingPresentations.get(window)?.()
    onHidden?.()
    return
  }
  dragRestorers.get(window)?.()
  stopWindowMotion(window)
  pendingPresentations.get(window)?.()

  if (!window.isVisible()) {
    onHidden?.()
    return
  }

  if (!shouldAnimateWindow() || !setOpacitySafely(window, 1)) {
    window.hide()
    onHidden?.()
    return
  }

  animateWindowOpacity({
    window,
    from: 1,
    to: 0,
    durationMs: HIDE_DURATION_MS,
    onComplete: () => {
      if (!window.isDestroyed()) window.hide()
      onHidden?.()
    },
  })
}

export const installWindowDragOpacity = (window: BrowserWindow): void => {
  const platform = process.platform
  if (platform !== 'darwin' && platform !== 'win32') return
  if (window.isDestroyed() || dragRestorers.has(window)) return

  let dragging = false
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const restore = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = undefined
    if (!dragging) return
    dragging = false
    setOpacitySafely(window, 1)
  }
  const scheduleMacRestore = () => {
    if (platform !== 'darwin' || !dragging) return
    if (idleTimer) clearTimeout(idleTimer)
    // macOS emits `moved` for every movement, rather than at drag completion.
    idleTimer = setTimeout(restore, MAC_MOVE_IDLE_MS)
  }
  const begin = () => {
    if (window.isDestroyed() || !window.isVisible() || window.isMinimized()) return
    stopWindowMotion(window)
    dragging = setOpacitySafely(window, DRAG_OPACITY)
    scheduleMacRestore()
  }
  const onMoved = () => {
    if (platform === 'win32') restore()
  }
  window.on('will-move', begin)
  window.on('move', scheduleMacRestore)
  window.on('moved', onMoved)
  window.on('blur', restore)
  window.on('hide', restore)
  window.on('minimize', restore)
  window.on('maximize', restore)
  window.on('enter-full-screen', restore)
  window.on('close', restore)
  window.once('closed', () => {
    restore()
    window.removeListener('will-move', begin)
    window.removeListener('move', scheduleMacRestore)
    window.removeListener('moved', onMoved)
    window.removeListener('blur', restore)
    window.removeListener('hide', restore)
    window.removeListener('minimize', restore)
    window.removeListener('maximize', restore)
    window.removeListener('enter-full-screen', restore)
    window.removeListener('close', restore)
    dragRestorers.delete(window)
  })
  dragRestorers.set(window, restore)
}
