import type { BrowserWindow } from 'electron'
import { installNativeMenu } from '@electron/menu'
import type { Logger } from '@electron/services/logger'
import { createMarklabWindows, type MarklabWindows } from '@electron/window'
import type { MarklabWindowPool } from '@electron/windowPool'

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
  void options
    .ensureWindowPool()
    .prewarmMainWindow()
    .catch((error) => {
      options.logger.warn('unable to prewarm lightweight main window', { error })
    })
  return windows
}
