import type { BrowserWindow } from 'electron'
import type { ElectronContainer } from '@electron/container.js'
import { installNativeMenu } from '@electron/menu.js'
import { createMarklabWindows, type MarklabWindows } from '@electron/window.js'
import type { MarklabWindowPool } from '@electron/windowPool.js'

type Logger = ElectronContainer['cradle']['logger']
type NativeMenuDispatcher = Parameters<typeof installNativeMenu>[1]

type WindowSessionOptions = {
  dispatchNativeMenuAction: NativeMenuDispatcher
  ensureWindowPool: () => MarklabWindowPool
  installManagedMainWindowLifecycle: (main: BrowserWindow, logger?: Logger) => void
  logger: Logger
}

export const createMainWindowSession = async (
  options: WindowSessionOptions,
): Promise<MarklabWindows> => {
  const windows = await createMarklabWindows(
    options.logger.child('window'),
    options.ensureWindowPool(),
  )
  installNativeMenu(windows.main, options.dispatchNativeMenuAction)
  options.installManagedMainWindowLifecycle(windows.main, options.logger)
  return windows
}
