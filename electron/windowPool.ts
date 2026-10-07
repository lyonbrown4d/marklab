import os from 'node:os'

import type { BrowserWindow } from 'electron'

import { noopLogger, type Logger } from '@electron/services/logger'
import {
  createMainWindow as createDefaultMainWindow,
  loadMainWindow as loadDefaultMainWindow,
  loadWindowOpeningShell as loadDefaultOpeningWindow,
} from '@electron/window'

const DEFAULT_MAX_IDLE_MAIN_WINDOWS = 1
const DEFAULT_MINIMUM_FREE_MEMORY_BYTES = 512 * 1024 * 1024

export type WindowPoolAcquisition = {
  metrics: {
    constructorCallsAvoided: 0 | 1
    openingShellLoadsAvoided: 0 | 1
    preparationDurationMs: number
  }
  source: 'cold' | 'pool'
  window: BrowserWindow
}

export type WindowPoolStats = {
  activeMainWindows: number
  coldStarts: number
  createdMainWindows: number
  idleMainWindows: number
  mainRendererLoads: number
  maxIdleMainWindows: number
  openingShellLoads: number
  poolHits: number
}

export type MarklabWindowPool = {
  acquireMainWindow: () => Promise<WindowPoolAcquisition>
  activateMainWindow: (acquisition: WindowPoolAcquisition) => Promise<void>
  dispose: () => Promise<void>
  destroyIdleWindows: () => void
  prewarmMainWindow: () => Promise<void>
  restoreOpeningWindow: (acquisition: WindowPoolAcquisition) => Promise<void>
  stats: () => WindowPoolStats
}

type MarklabWindowPoolOptions = {
  createMainWindow?: (logger: Logger) => BrowserWindow
  hasMemoryHeadroom?: () => boolean
  loadMainWindow?: (window: BrowserWindow) => Promise<void>
  loadOpeningWindow?: (window: BrowserWindow) => Promise<void>
  maxIdleMainWindows?: number
  now?: () => number
}

const isUsableWindow = (window: BrowserWindow): boolean =>
  !window.isDestroyed() && !window.webContents.isDestroyed()

export const createMarklabWindowPool = (
  logger: Logger = noopLogger,
  options: MarklabWindowPoolOptions = {},
): MarklabWindowPool => {
  const createMainWindow = options.createMainWindow ?? createDefaultMainWindow
  const loadMainWindow = options.loadMainWindow ?? loadDefaultMainWindow
  const loadOpeningWindow = options.loadOpeningWindow ?? loadDefaultOpeningWindow
  const hasMemoryHeadroom =
    options.hasMemoryHeadroom ?? (() => os.freemem() >= DEFAULT_MINIMUM_FREE_MEMORY_BYTES)
  const now = options.now ?? Date.now
  const maxIdleMainWindows = Math.max(
    0,
    Math.min(1, Math.floor(options.maxIdleMainWindows ?? DEFAULT_MAX_IDLE_MAIN_WINDOWS)),
  )
  const activeMainWindows = new Set<BrowserWindow>()
  const trackedMainWindows = new WeakSet<BrowserWindow>()
  let idleMainWindows: BrowserWindow[] = []
  let prewarmInFlight: Promise<void> | null = null
  let prewarmWindow: BrowserWindow | null = null
  let coldStarts = 0
  let createdMainWindows = 0
  let mainRendererLoads = 0
  let openingShellLoads = 0
  let poolHits = 0
  let disposed = false

  const destroyWindow = (window: BrowserWindow): void => {
    if (!window.isDestroyed()) window.destroy()
  }

  const pruneWindows = (): void => {
    idleMainWindows = idleMainWindows.filter(isUsableWindow)
    for (const window of activeMainWindows) {
      if (!isUsableWindow(window)) activeMainWindows.delete(window)
    }
  }

  const destroyIdleWindows = (): void => {
    const idle = idleMainWindows
    idleMainWindows = []
    idle.forEach(destroyWindow)
  }

  const destroyPrewarmWindow = (): void => {
    const window = prewarmWindow
    prewarmWindow = null
    prewarmInFlight = null
    if (window) destroyWindow(window)
  }

  const forgetWindow = (window: BrowserWindow): void => {
    activeMainWindows.delete(window)
    idleMainWindows = idleMainWindows.filter((candidate) => candidate !== window)
    if (activeMainWindows.size === 0) {
      destroyIdleWindows()
      destroyPrewarmWindow()
    }
  }

  const trackWindow = (window: BrowserWindow): void => {
    if (trackedMainWindows.has(window)) return
    trackedMainWindows.add(window)
    window.once('closed', () => forgetWindow(window))
    window.webContents.once('render-process-gone', () => {
      const wasIdle = idleMainWindows.includes(window)
      forgetWindow(window)
      destroyWindow(window)
      if (wasIdle && activeMainWindows.size > 0) void prewarmMainWindow()
    })
  }

  const createOpeningWindow = async (): Promise<BrowserWindow> => {
    const window = createMainWindow(logger.child('main'))
    createdMainWindows += 1
    trackWindow(window)
    try {
      await loadOpeningWindow(window)
      openingShellLoads += 1
      return window
    } catch (error) {
      destroyWindow(window)
      throw error
    }
  }

  const prewarmMainWindow = async (): Promise<void> => {
    if (disposed) return
    pruneWindows()
    if (!hasMemoryHeadroom()) {
      destroyIdleWindows()
      return
    }
    if (maxIdleMainWindows === 0 || idleMainWindows.length >= maxIdleMainWindows) return
    if (prewarmInFlight) return prewarmInFlight

    const prewarm = (async () => {
      const window = createMainWindow(logger.child('main'))
      createdMainWindows += 1
      trackWindow(window)
      prewarmWindow = window
      try {
        await loadOpeningWindow(window)
        if (!isUsableWindow(window)) return
        openingShellLoads += 1
        if (window.isVisible()) window.hide()
        if (disposed || !isUsableWindow(window) || idleMainWindows.length >= maxIdleMainWindows) {
          destroyWindow(window)
          return
        }
        idleMainWindows.push(window)
        logger.debug('prewarmed lightweight main window', stats())
      } catch (error) {
        const cancelled = disposed || prewarmWindow !== window || !isUsableWindow(window)
        destroyWindow(window)
        if (!cancelled) throw error
      } finally {
        if (prewarmWindow === window) prewarmWindow = null
      }
    })()
    const trackedPrewarm = prewarm.finally(() => {
      if (prewarmInFlight === trackedPrewarm) prewarmInFlight = null
    })
    prewarmInFlight = trackedPrewarm
    return trackedPrewarm
  }

  const acquireMainWindow = async (): Promise<WindowPoolAcquisition> => {
    if (disposed) throw new Error('Cannot acquire a window from a disposed pool.')
    if (prewarmInFlight) await prewarmInFlight
    if (disposed) throw new Error('Cannot acquire a window from a disposed pool.')
    pruneWindows()
    const startedAt = now()
    const pooledWindow = idleMainWindows.shift()
    if (pooledWindow) {
      activeMainWindows.add(pooledWindow)
      poolHits += 1
      return {
        metrics: {
          constructorCallsAvoided: 1,
          openingShellLoadsAvoided: 1,
          preparationDurationMs: Math.max(0, now() - startedAt),
        },
        source: 'pool',
        window: pooledWindow,
      }
    }

    const window = await createOpeningWindow()
    activeMainWindows.add(window)
    coldStarts += 1
    return {
      metrics: {
        constructorCallsAvoided: 0,
        openingShellLoadsAvoided: 0,
        preparationDurationMs: Math.max(0, now() - startedAt),
      },
      source: 'cold',
      window,
    }
  }

  const activateMainWindow = async (acquisition: WindowPoolAcquisition): Promise<void> => {
    if (!activeMainWindows.has(acquisition.window) || !isUsableWindow(acquisition.window)) {
      throw new Error('Cannot activate an unavailable main window.')
    }
    await loadMainWindow(acquisition.window)
    mainRendererLoads += 1
  }

  const restoreOpeningWindow = async (acquisition: WindowPoolAcquisition): Promise<void> => {
    if (!activeMainWindows.has(acquisition.window) || acquisition.window.isDestroyed()) {
      throw new Error('Cannot restore an unavailable main window.')
    }
    await loadOpeningWindow(acquisition.window)
    openingShellLoads += 1
  }

  const stats = (): WindowPoolStats => {
    pruneWindows()
    return {
      activeMainWindows: activeMainWindows.size,
      coldStarts,
      createdMainWindows,
      idleMainWindows: idleMainWindows.length,
      mainRendererLoads,
      maxIdleMainWindows,
      openingShellLoads,
      poolHits,
    }
  }

  const dispose = async (): Promise<void> => {
    if (!disposed) {
      disposed = true
      destroyIdleWindows()
      destroyPrewarmWindow()
    }
  }

  return {
    acquireMainWindow,
    activateMainWindow,
    dispose,
    destroyIdleWindows,
    prewarmMainWindow,
    restoreOpeningWindow,
    stats,
  }
}
