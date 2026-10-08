import type { BrowserWindow } from 'electron'
import { MAIN_WINDOW_ID } from '@electron/services/settingsStoreValues'

type WindowStatePersistence = {
  finalize: () => void
  flush: () => void
  release: () => void
  switchScope: (stateKey: string, restoreState: () => void) => void
}

const persistenceByWindow = new WeakMap<BrowserWindow, WindowStatePersistence>()

export const installWindowStatePersistence = (
  window: BrowserWindow,
  writeState: (stateKey: string) => void,
  delayMs: number,
  initialStateKey = MAIN_WINDOW_ID,
): void => {
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let enabled = true
  let stateKey = initialStateKey
  const saveNow = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    if (enabled && !window.isDestroyed()) writeState(stateKey)
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
  const switchScope = (nextStateKey: string, restoreState: () => void) => {
    if (!enabled || stateKey === nextStateKey) return
    saveNow()
    stateKey = nextStateKey
    restoreState()
  }
  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('maximize', scheduleSave)
  window.on('unmaximize', scheduleSave)
  window.on('close', saveNow)
  window.once('closed', () => persistenceByWindow.delete(window))
  persistenceByWindow.set(window, { finalize, flush: saveNow, release, switchScope })
}

export const switchPersistedWindowStateScope = (
  window: BrowserWindow,
  stateKey: string,
  restoreState: () => void,
): void => {
  persistenceByWindow.get(window)?.switchScope(stateKey, restoreState)
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
