import type { BrowserWindow } from 'electron'
import { installNativeMenu } from '@electron/menu'
import type { Logger } from '@electron/services/logger'
import { DEFAULT_SESSION_KEY } from '@electron/services/settingsStoreValues'
import { createMarklabWindows, type MarklabWindows } from '@electron/window'
import { activatePersistedWorkspaceWindowState } from '@electron/windowStateRestore'
import type { MarklabWindowPool } from '@electron/windowPool'

type NativeMenuDispatcher = Parameters<typeof installNativeMenu>[1]

type WindowSessionOptions = {
  dispatchNativeMenuAction: NativeMenuDispatcher
  ensureWindowPool: () => MarklabWindowPool
  installManagedMainWindowLifecycle: (
    main: BrowserWindow,
    logger?: Logger,
    sessionKey?: string,
  ) => void
  logger: Logger
  loadedSplash?: BrowserWindow
}

type StartupWindowSessionOptions = {
  createSession: (splash: BrowserWindow) => Promise<MarklabWindows>
  createSplash: () => Promise<BrowserWindow>
  startRuntime: () => Promise<void>
}

export const createStartupWindowSession = async ({
  createSession,
  createSplash,
  startRuntime,
}: StartupWindowSessionOptions): Promise<MarklabWindows> => {
  const splash = await createSplash()
  try {
    await startRuntime()
    return await createSession(splash)
  } catch (error) {
    if (!splash.isDestroyed()) splash.destroy()
    throw error
  }
}

export const createMainWindowSession = async (
  options: WindowSessionOptions,
): Promise<MarklabWindows> => {
  const windows = await createMarklabWindows(
    options.logger.child('window'),
    options.ensureWindowPool(),
    options.loadedSplash,
  )
  installNativeMenu(windows.main, options.dispatchNativeMenuAction)
  activatePersistedWorkspaceWindowState(windows.main, DEFAULT_SESSION_KEY, options.logger)
  options.installManagedMainWindowLifecycle(windows.main, options.logger, DEFAULT_SESSION_KEY)
  return windows
}
