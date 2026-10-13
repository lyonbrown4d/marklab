import type { BrowserWindow } from 'electron'
import { isBackgroundElectronE2e } from '@electron/main/e2eRuntime'

const SHOW_DURATION_MS = 140
const HIDE_DURATION_MS = 160
const FRAME_MS = 16
const DRAG_OPACITY = 0.85
const MAC_MOVE_IDLE_MS = 180

const activeTimers = new WeakMap<BrowserWindow, ReturnType<typeof setTimeout>>()
const dragRestorers = new WeakMap<BrowserWindow, () => void>()

const stopWindowMotion = (window: BrowserWindow): void => {
  const timer = activeTimers.get(window)
  if (!timer) return
  clearTimeout(timer)
  activeTimers.delete(window)
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
  onComplete,
}: {
  window: BrowserWindow
  from: number
  to: number
  durationMs: number
  onComplete: () => void
}): void => {
  stopWindowMotion(window)

  const startedAt = Date.now()
  const step = () => {
    if (window.isDestroyed()) {
      activeTimers.delete(window)
      return
    }

    const elapsed = Date.now() - startedAt
    const progress = Math.min(1, elapsed / durationMs)
    const opacity = from + (to - from) * progress
    if (!setOpacitySafely(window, opacity)) {
      onComplete()
      activeTimers.delete(window)
      return
    }

    if (progress >= 1) {
      onComplete()
      activeTimers.delete(window)
      return
    }

    activeTimers.set(window, setTimeout(step, FRAME_MS))
  }

  step()
}

export const showWindowWithMotion = (window: BrowserWindow, options: { focus?: boolean } = {}) => {
  if (window.isDestroyed()) return
  dragRestorers.get(window)?.()
  stopWindowMotion(window)
  if (isBackgroundElectronE2e()) {
    setOpacitySafely(window, 1)
    return
  }

  if (window.isVisible()) {
    setOpacitySafely(window, 1)
    if (options.focus) window.focus()
    return
  }

  const canAnimate = setOpacitySafely(window, 0)
  window.show()
  if (options.focus) window.focus()

  if (!canAnimate) return
  animateWindowOpacity({
    window,
    from: 0,
    to: 1,
    durationMs: SHOW_DURATION_MS,
    onComplete: () => {
      setOpacitySafely(window, 1)
    },
  })
}

export const hideWindowWithMotion = (window: BrowserWindow, onHidden?: () => void) => {
  if (window.isDestroyed()) return
  dragRestorers.get(window)?.()
  stopWindowMotion(window)

  if (!window.isVisible()) {
    onHidden?.()
    return
  }

  if (!setOpacitySafely(window, 1)) {
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
    stopWindowMotion(window)
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
