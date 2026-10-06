import { BrowserWindow } from 'electron'
import type { ElectronContainer } from '@electron/container'
import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke'
import type { NativeIpcRegistration } from '@electron/ipc/index'
import {
  createAppWindowCommandHandlers,
  createNativeMenuActionDispatcher,
} from '@electron/main/windowCommands'
import type { MenuActionDispatcher } from '@electron/menu'
import type { Logger } from '@electron/services/logger'
import {
  copyRendererPersistSession,
  writeRendererPersistSession,
} from '@electron/services/settingsStore'
import type { MarklabWindowPool } from '@electron/windowPool'

type WindowCommandSetupArgs = {
  getContainer: () => ElectronContainer
  getNativeIpc: () => NativeIpcRegistration | null
  getPrimaryWindow: () => BrowserWindow | null
  getWindowPool: () => MarklabWindowPool
  installManagedMainWindowLifecycle: (main: BrowserWindow, logger?: Logger) => void
}

export type WindowCommandSetup = {
  commandHandlers: NativeCommandHandlers
  dispatchMenuAction: MenuActionDispatcher
  openPathInNewWindow: (path: string) => Promise<unknown>
  openSystemPath: (path: string, disposition: 'current' | 'new') => Promise<unknown>
}

export const createWindowCommandSetup = ({
  getContainer,
  getNativeIpc,
  getPrimaryWindow,
  getWindowPool,
  installManagedMainWindowLifecycle,
}: WindowCommandSetupArgs): WindowCommandSetup => {
  const dependencies = {
    copyWorkspaceSession: (sourceSessionKey: string, targetSessionKey: string, overrides = {}) =>
      copyRendererPersistSession(
        'marklab.workspace',
        sourceSessionKey,
        targetSessionKey,
        overrides,
      ),
    getCurrentWorkspaceRoot: (sourceWindow?: BrowserWindow | null) => {
      const window = sourceWindow ?? BrowserWindow.getFocusedWindow() ?? getPrimaryWindow()
      if (!window || window.isDestroyed()) {
        throw new Error('No active workspace window is available')
      }
      return getContainer().cradle.workspaceRegistry.rootInfoForWindow(window)
    },
    getLogger: () => getContainer().cradle.logger,
    getNativeIpc,
    getPrimaryWindow,
    getSessionKeyForWindow: (window: BrowserWindow) =>
      getContainer().cradle.workspaceRegistry.sessionKeyForWindow(window),
    getWorkspaceServiceForWindow: (window: BrowserWindow) =>
      getContainer().cradle.workspaceRegistry.registerWindow(window),
    getWindowPool,
    installManagedMainWindowLifecycle,
    writeWorkspaceSession: (targetSessionKey: string, state: Record<string, unknown>) =>
      writeRendererPersistSession('marklab.workspace', targetSessionKey, state),
  }

  const commandHandlers = createAppWindowCommandHandlers(dependencies)

  return {
    commandHandlers,
    dispatchMenuAction: createNativeMenuActionDispatcher(dependencies, commandHandlers),
    openPathInNewWindow: (path: string) =>
      Promise.resolve(commandHandlers.open_path_in_new_window({ path }, null as never)),
    openSystemPath: (path: string, disposition: 'current' | 'new') =>
      Promise.resolve(
        commandHandlers[
          disposition === 'current' ? 'open_path_in_current_window' : 'open_path_in_new_window'
        ]({ path }, null as never),
      ),
  }
}
