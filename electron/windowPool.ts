import type { BrowserWindow } from 'electron'
import { noopLogger, type Logger } from '@electron/services/logger.js'
import { createLoadedMainWindow } from '@electron/window.js'

const DEFAULT_MAX_IDLE_MAIN_WINDOWS = 1

export type WindowPoolStats = {
  activeMainWindows: number
  idleMainWindows: number
  maxIdleMainWindows: number
}

export type MarklabWindowPool = {
  acquireMainWindow: () => Promise<BrowserWindow>
  releaseMainWindow: (window: BrowserWindow) => void
  destroyIdleWindows: () => void
  stats: () => WindowPoolStats
}

type MarklabWindowPoolOptions = {
  maxIdleMainWindows?: number
}

const isUsableWindow = (window: BrowserWindow): boolean => {
  return !window.isDestroyed()
}

export const createMarklabWindowPool = (
  logger: Logger = noopLogger,
  options: MarklabWindowPoolOptions = {},
): MarklabWindowPool => {
  const activeMainWindows = new Set<BrowserWindow>()
  const trackedMainWindows = new WeakSet<BrowserWindow>()
  const maxIdleMainWindows = Math.max(
    0,
    Math.floor(options.maxIdleMainWindows ?? DEFAULT_MAX_IDLE_MAIN_WINDOWS),
  )
  let idleMainWindows: BrowserWindow[] = []

  const pruneIdleWindows = (): void => {
    idleMainWindows = idleMainWindows.filter(isUsableWindow)
  }

  const forgetWindow = (window: BrowserWindow): void => {
    activeMainWindows.delete(window)
    idleMainWindows = idleMainWindows.filter((candidate) => candidate !== window)
  }

  const trackActiveWindow = (window: BrowserWindow): BrowserWindow => {
    activeMainWindows.add(window)
    if (!trackedMainWindows.has(window)) {
      trackedMainWindows.add(window)
      window.once('closed', () => forgetWindow(window))
    }
    return window
  }

  const takeIdleWindow = (): BrowserWindow | null => {
    pruneIdleWindows()
    const window = idleMainWindows.shift() ?? null
    if (!window) return null
    logger.debug('reusing idle main window', stats())
    return window
  }

  const acquireMainWindow = async (): Promise<BrowserWindow> => {
    const idleWindow = takeIdleWindow()
    if (idleWindow) return trackActiveWindow(idleWindow)

    logger.info('creating main window', stats())
    return trackActiveWindow(await createLoadedMainWindow(logger.child('main')))
  }

  const releaseMainWindow = (window: BrowserWindow): void => {
    if (!isUsableWindow(window)) {
      forgetWindow(window)
      return
    }

    activeMainWindows.delete(window)
    if (idleMainWindows.includes(window)) return

    if (idleMainWindows.length >= maxIdleMainWindows) {
      logger.debug('destroying released main window because pool is full', stats())
      window.destroy()
      return
    }

    window.hide()
    idleMainWindows.push(window)
    logger.debug('released main window to idle pool', stats())
  }

  const destroyIdleWindows = (): void => {
    for (const window of idleMainWindows) {
      if (!window.isDestroyed()) window.destroy()
    }
    idleMainWindows = []
  }

  const stats = (): WindowPoolStats => {
    pruneIdleWindows()
    return {
      activeMainWindows: activeMainWindows.size,
      idleMainWindows: idleMainWindows.length,
      maxIdleMainWindows,
    }
  }

  return {
    acquireMainWindow,
    releaseMainWindow,
    destroyIdleWindows,
    stats,
  }
}
