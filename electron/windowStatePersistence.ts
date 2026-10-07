import type { BrowserWindow } from 'electron'

type WindowStatePersistence = {
  finalize: () => void
  flush: () => void
  release: () => void
}

const persistenceByWindow = new WeakMap<BrowserWindow, WindowStatePersistence>()

export const installWindowStatePersistence = (
  window: BrowserWindow,
  writeState: () => void,
  delayMs: number,
): void => {
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let enabled = true
  const saveNow = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    if (enabled && !window.isDestroyed()) writeState()
  }
  const scheduleSave = () => {
    if (!enabled) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveNow, delayMs)
  }
  const release = () => {
    enabled = false
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    window.removeListener('resize', scheduleSave)
    window.removeListener('move', scheduleSave)
    window.removeListener('maximize', scheduleSave)
    window.removeListener('unmaximize', scheduleSave)
    window.removeListener('close', saveNow)
  }
  const finalize = () => {
    saveNow()
    release()
  }
  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('maximize', scheduleSave)
  window.on('unmaximize', scheduleSave)
  window.on('close', saveNow)
  window.once('closed', () => persistenceByWindow.delete(window))
  persistenceByWindow.set(window, { finalize, flush: saveNow, release })
}

export const flushPersistedWindowState = (window: BrowserWindow): void => {
  persistenceByWindow.get(window)?.flush()
}

export const finalizePersistedWindowState = (window: BrowserWindow): void => {
  persistenceByWindow.get(window)?.finalize()
}

export const releasePersistedWindowState = (window: BrowserWindow): void => {
  persistenceByWindow.get(window)?.release()
}
