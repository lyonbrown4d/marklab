import type { BrowserWindow } from 'electron'

const SHOW_DURATION_MS = 140
const HIDE_DURATION_MS = 110
const FRAME_MS = 16

const activeTimers = new WeakMap<BrowserWindow, ReturnType<typeof setTimeout>>()

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
  stopWindowMotion(window)

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
