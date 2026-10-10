import { BrowserWindow } from 'electron'
import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke'
import type { NativeIpcRegistration } from '@electron/ipc'
import {
  createAppWindowCommandHandlers,
  createNativeMenuActionDispatcher,
  openStartupPathInCurrentWindow,
} from '@electron/main/windowCommands'
import type { MenuActionDispatcher } from '@electron/menu'
import type { Logger } from '@electron/services/logger'
import {
  copyRendererPersistSession,
  writeRendererPersistSession,
} from '@electron/services/settingsStore'
import type { MarklabWindowPool } from '@electron/windowPool'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'
import { activateWorkspaceWindowState } from '@electron/windowStateRestore'

type WindowCommandServices = {
  logger: Logger
  workspaceRegistry: Pick<
    WindowWorkspaceRegistry,
    'registerWindow' | 'rootInfoForWindow' | 'sessionKeyForWindow'
  >
}

type WindowCommandSetupArgs = {
  getServices: () => WindowCommandServices
  getNativeIpc: () => NativeIpcRegistration | null
  getPrimaryWindow: () => BrowserWindow | null
  getWindowPool: () => MarklabWindowPool
  installManagedMainWindowLifecycle: (main: BrowserWindow, logger?: Logger) => void
  isPrimaryWindowBootstrapping: (window: BrowserWindow) => boolean
  presentPrimaryWindow: (window: BrowserWindow) => void
}

export type WindowCommandSetup = {
  commandHandlers: NativeCommandHandlers
  dispatchMenuAction: MenuActionDispatcher
  openPathInNewWindow: (path: string) => Promise<unknown>
  openSystemPath: (
    path: string,
    disposition: 'current' | 'new',
    options?: { signal?: AbortSignal; startup?: boolean },
  ) => Promise<unknown>
}

export const createWindowCommandSetup = ({
  getServices,
  getNativeIpc,
  getPrimaryWindow,
  getWindowPool,
  installManagedMainWindowLifecycle,
  isPrimaryWindowBootstrapping,
  presentPrimaryWindow,
}: WindowCommandSetupArgs): WindowCommandSetup => {
  const dependencies = {
    activateWorkspaceWindowState: (
      window: BrowserWindow,
      root: Parameters<typeof activateWorkspaceWindowState>[1],
    ) => activateWorkspaceWindowState(window, root, getServices().logger),
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
      return getServices().workspaceRegistry.rootInfoForWindow(window)
    },
    getLogger: () => getServices().logger,
    getNativeIpc,
    getPrimaryWindow,
    getSessionKeyForWindow: (window: BrowserWindow) =>
      getServices().workspaceRegistry.sessionKeyForWindow(window),
    getWorkspaceServiceForWindow: (window: BrowserWindow) =>
      getServices().workspaceRegistry.registerWindow(window),
    getWindowPool,
    installManagedMainWindowLifecycle,
    isPrimaryWindowBootstrapping,
    presentPrimaryWindow,
    writeWorkspaceSession: (targetSessionKey: string, state: Record<string, unknown>) =>
      writeRendererPersistSession('marklab.workspace', targetSessionKey, state),
  }

  const commandHandlers = createAppWindowCommandHandlers(dependencies)

  return {
    commandHandlers,
    dispatchMenuAction: createNativeMenuActionDispatcher(dependencies, commandHandlers),
    openPathInNewWindow: (path: string) =>
      Promise.resolve(commandHandlers.open_path_in_new_window({ path }, null as never)),
    openSystemPath: (path: string, disposition: 'current' | 'new', options) => {
      if (disposition === 'current' && options?.startup) {
        return options.signal
          ? openStartupPathInCurrentWindow(dependencies, { path }, { signal: options.signal })
          : openStartupPathInCurrentWindow(dependencies, { path })
      }
      return Promise.resolve(
        commandHandlers[
          disposition === 'current' ? 'open_path_in_current_window' : 'open_path_in_new_window'
        ]({ path }, null as never),
      )
    },
  }
}
