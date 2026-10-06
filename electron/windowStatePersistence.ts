import type { BrowserWindow } from 'electron'

const flushers = new WeakMap<BrowserWindow, () => void>()

export const installWindowStatePersistence = (
  window: BrowserWindow,
  writeState: () => void,
  delayMs: number,
): void => {
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const saveNow = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    if (!window.isDestroyed()) writeState()
  }
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveNow, delayMs)
  }
  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('maximize', scheduleSave)
  window.on('unmaximize', scheduleSave)
  window.on('close', saveNow)
  window.once('closed', () => flushers.delete(window))
  flushers.set(window, saveNow)
}

export const flushPersistedWindowState = (window: BrowserWindow): void => {
  flushers.get(window)?.()
}
