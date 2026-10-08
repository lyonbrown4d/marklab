import { screen, type BrowserWindow } from 'electron'
import type { Logger } from '@electron/services/logger'
import { getRendererPersistValue, getWindowState } from '@electron/services/settingsStore'
import { createWorkspaceStorageKey } from '@electron/services/workspace/workspaceIdentity'
import type { FsRootInfo } from '@electron/services/workspace/types'
import { switchPersistedWindowStateScope } from '@electron/windowStatePersistence'
import type { PersistedWindowState } from '@electron/types'
import { RENDERER_PERSIST_KEYS } from '@/types/persistenceKeys'

export const MAIN_WINDOW_MIN_WIDTH = 640
export const MAIN_WINDOW_MIN_HEIGHT = 480
export const MAIN_WINDOW_DEFAULT_WIDTH = 800
export const MAIN_WINDOW_DEFAULT_HEIGHT = 600

type WindowBounds = {
  height: number
  width: number
  x: number
  y: number
}

type RestoredWindowState = {
  bounds: Pick<WindowBounds, 'height' | 'width'> & Partial<Pick<WindowBounds, 'x' | 'y'>>
  isMaximized: boolean
}

const pendingMaximizeByWindow = new WeakMap<BrowserWindow, () => void>()

export const restoreMaximizedOnFirstShow = (
  window: BrowserWindow,
  shouldMaximize: boolean,
): void => {
  const pending = pendingMaximizeByWindow.get(window)
  if (pending) {
    window.removeListener('show', pending)
    pendingMaximizeByWindow.delete(window)
  }
  if (!shouldMaximize) return
  const maximize = () => {
    pendingMaximizeByWindow.delete(window)
    if (!window.isDestroyed()) window.maximize()
  }
  pendingMaximizeByWindow.set(window, maximize)
  window.once('show', maximize)
}

const rectanglesIntersect = (left: WindowBounds, right: WindowBounds): boolean =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y

const hasVisibleArea = (bounds: WindowBounds): boolean =>
  screen.getAllDisplays().some((display) => rectanglesIntersect(bounds, display.workArea))

const restoredWindowState = (
  stateKey: string,
  logger: Pick<Logger, 'warn'>,
): RestoredWindowState | null => {
  let state: PersistedWindowState | null
  try {
    state = getWindowState(stateKey)
  } catch (error) {
    logger.warn('unable to read persisted window state', { error })
    return null
  }
  if (!state) return null
  const visibleBounds =
    state.x !== undefined && state.y !== undefined
      ? { height: state.height, width: state.width, x: state.x, y: state.y }
      : null
  return {
    bounds:
      visibleBounds && hasVisibleArea(visibleBounds)
        ? visibleBounds
        : { height: state.height, width: state.width },
    isMaximized: state.isMaximized,
  }
}

export const getInitialWindowState = (
  stateKey: string,
  logger: Pick<Logger, 'warn'>,
): RestoredWindowState =>
  restoredWindowState(stateKey, logger) ?? {
    bounds: { height: MAIN_WINDOW_DEFAULT_HEIGHT, width: MAIN_WINDOW_DEFAULT_WIDTH },
    isMaximized: false,
  }

export const activateWorkspaceWindowState = (
  window: BrowserWindow,
  root: Pick<FsRootInfo, 'kind' | 'path'>,
  logger: Pick<Logger, 'warn'>,
): void => {
  try {
    const stateKey = createWorkspaceStorageKey(root)
    switchPersistedWindowStateScope(window, stateKey, () => {
      const restored = restoredWindowState(stateKey, logger)
      if (!restored || window.isDestroyed()) return
      if (window.isMaximized()) window.unmaximize()
      window.setBounds(restored.bounds)
      if (window.isVisible()) {
        restoreMaximizedOnFirstShow(window, false)
        if (restored.isMaximized) window.maximize()
        return
      }
      restoreMaximizedOnFirstShow(window, restored.isMaximized)
    })
  } catch (error) {
    logger.warn('unable to activate workspace window state', { error })
  }
}

const persistedWorkspaceRoot = (sessionKey: string): Pick<FsRootInfo, 'kind' | 'path'> | null => {
  const persisted = getRendererPersistValue(RENDERER_PERSIST_KEYS.workspace, sessionKey)
  if (!persisted || typeof persisted !== 'object' || !('state' in persisted)) return null
  const state = persisted.state
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null
  const { rootKind, rootPath } = state as Record<string, unknown>
  if (
    (rootKind !== 'external' && rootKind !== 'internal' && rootKind !== 'single') ||
    typeof rootPath !== 'string' ||
    !rootPath
  ) {
    return null
  }
  return { kind: rootKind, path: rootPath }
}

export const activatePersistedWorkspaceWindowState = (
  window: BrowserWindow,
  sessionKey: string,
  logger: Pick<Logger, 'warn'>,
): void => {
  try {
    const root = persistedWorkspaceRoot(sessionKey)
    if (root) activateWorkspaceWindowState(window, root, logger)
  } catch (error) {
    logger.warn('unable to restore persisted workspace window state', { error })
  }
}
