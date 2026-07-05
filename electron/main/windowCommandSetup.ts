import { BrowserWindow } from 'electron'
import type { ElectronContainer } from '@electron/container.js'
import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke.js'
import type { NativeIpcRegistration } from '@electron/ipc/index.js'
import {
  createAppWindowCommandHandlers,
  createNativeMenuActionDispatcher,
} from '@electron/main/windowCommands.js'
import type { MenuActionDispatcher } from '@electron/menu.js'
import type { Logger } from '@electron/services/logger.js'
import {
  copyRendererPersistSession,
  writeRendererPersistSession,
} from '@electron/services/settingsStore.js'
import type { MarklabWindowPool } from '@electron/windowPool.js'

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
    getCurrentWorkspaceRoot: () =>
      getContainer().cradle.workspaceRegistry.rootInfoForWindow(
        BrowserWindow.getFocusedWindow() ?? getPrimaryWindow(),
      ),
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
    dispatchMenuAction: createNativeMenuActionDispatcher(dependencies),
    openPathInNewWindow: (path: string) =>
      Promise.resolve(commandHandlers.open_path_in_new_window({ path }, null as never)),
  }
}
