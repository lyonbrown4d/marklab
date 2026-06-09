import type * as Electron from 'electron'
import { registerAppReadyIpc } from '@electron/ipc/appReady.js'
import { registerClipboardIpc } from '@electron/ipc/clipboard.js'
import {
  registerCommandInvokeIpc,
  type NativeCommandHandlers,
} from '@electron/ipc/commandInvoke.js'
import { registerDialogIpc } from '@electron/ipc/dialogs.js'
import {
  registerGitTerminalIpc,
  type GitTerminalIpcBridge,
} from '@electron/ipc/gitTerminalCommands.js'
import { registerLifecycleIpc } from '@electron/ipc/lifecycle.js'
import { registerMenuDispatchIpc } from '@electron/ipc/menu.js'
import { registerPlatformIpc } from '@electron/ipc/platform.js'
import { registerSettingsIpc } from '@electron/ipc/settings.js'
import { registerShellIpc } from '@electron/ipc/shell.js'
import { registerThemeIpc } from '@electron/ipc/themes.js'
import { registerUpdatesIpc, type UpdaterIpcDependencies } from '@electron/ipc/updates.js'
import { registerWindowControlsIpc } from '@electron/ipc/windowControls.js'
import {
  registerWorkspaceCommandsIpc,
  type WorkspaceCommandServices,
} from '@electron/ipc/workspaceCommands.js'
import type { ExportService } from '@electron/services/export/exportService.js'
import type { GitService } from '@electron/services/git/service.js'
import type { Logger } from '@electron/services/logger.js'
import type { MenuDispatchBridge } from '@electron/services/menuDispatch.js'
import { getPlatformInfo } from '@electron/services/platform.js'
import type { TerminalService } from '@electron/services/terminal/service.js'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry.js'
export type NativeIpcDependencies = {
  app: Electron.App
  BrowserWindow: typeof Electron.BrowserWindow
  clipboard: Electron.Clipboard
  dialog: Electron.Dialog
  ipcMain: Electron.IpcMain
  getLaunchInfo: () => import('@electron/types.js').AppLaunchInfo
  exportService: ExportService
  gitService: GitService
  logger: Logger
  onRendererReady?: () => void
  shell: Electron.Shell
  terminalService: TerminalService
  updates?: Pick<UpdaterIpcDependencies, 'onBeforeInstall'>
  workspaceRegistry: WindowWorkspaceRegistry
  windowCommandHandlers?: NativeCommandHandlers
}
export type NativeIpcRegistration = {
  commands: WorkspaceCommandServices
  gitTerminal: GitTerminalIpcBridge
  menu: MenuDispatchBridge
}
export const registerNativeIpc = (dependencies: NativeIpcDependencies): NativeIpcRegistration => {
  const logger = dependencies.logger.child('ipc')
  registerAppReadyIpc(dependencies.ipcMain, dependencies.app, dependencies.onRendererReady)
  registerClipboardIpc(dependencies.ipcMain, dependencies.clipboard)
  registerDialogIpc(dependencies.ipcMain, dependencies.dialog, dependencies.BrowserWindow)
  registerLifecycleIpc(dependencies.ipcMain, dependencies.getLaunchInfo)
  registerPlatformIpc(dependencies.ipcMain)
  registerSettingsIpc(dependencies.ipcMain, dependencies.workspaceRegistry)
  registerShellIpc(dependencies.ipcMain, dependencies.shell)
  registerThemeIpc(dependencies.ipcMain, dependencies.shell)
  registerUpdatesIpc({
    app: dependencies.app,
    BrowserWindow: dependencies.BrowserWindow,
    ipcMain: dependencies.ipcMain,
    logger,
    onBeforeInstall: dependencies.updates?.onBeforeInstall,
  })
  registerWindowControlsIpc(dependencies.ipcMain, dependencies.BrowserWindow)
  const commands = registerWorkspaceCommandsIpc(dependencies.ipcMain, {
    exportService: dependencies.exportService,
    logger: logger.child('workspace'),
    workspaceRegistry: dependencies.workspaceRegistry,
  })
  const gitTerminal = registerGitTerminalIpc(dependencies.ipcMain, dependencies.app, {
    gitService: dependencies.gitService,
    logger: logger.child('git-terminal'),
    terminalService: dependencies.terminalService,
  })
  const menu = registerMenuDispatchIpc(dependencies.ipcMain, () =>
    dependencies.BrowserWindow.getFocusedWindow(),
  )
  registerCommandInvokeIpc(
    dependencies.ipcMain,
    createRuntimeCommandHandlers(
      commands,
      gitTerminal,
      menu,
      dependencies.windowCommandHandlers,
      dependencies.onRendererReady,
    ),
    logger.child('command-invoke'),
  )
  logger.info('native IPC registered')
  return { commands, gitTerminal, menu }
}
const createRuntimeCommandHandlers = (
  commands: WorkspaceCommandServices,
  gitTerminal: GitTerminalIpcBridge,
  menu: MenuDispatchBridge,
  windowCommandHandlers: NativeCommandHandlers = {},
  onRendererReady?: () => void,
): NativeCommandHandlers => {
  return {
    ...commands.commandHandlers,
    ...gitTerminal.commandHandlers,
    ...windowCommandHandlers,
    'app-ready': () => {
      onRendererReady?.()
      return { ok: true }
    },
    app_get_platform: () => getPlatformInfo().platform,
    menu_dispatch: (payload) => {
      const id = menuActionId(payload)
      menu.dispatchToFocusedWindow(id)
      return { ok: true }
    },
  }
}
const menuActionId = (payload: unknown): string => {
  const id = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).id : null
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('menu_dispatch requires an id string')
  }
  return id
}
