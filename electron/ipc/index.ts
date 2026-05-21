import type * as Electron from 'electron'
import { registerAppReadyIpc } from './appReady.js'
import { registerClipboardIpc } from './clipboard.js'
import { registerCommandInvokeIpc, type NativeCommandHandlers } from './commandInvoke.js'
import { registerDialogIpc } from './dialogs.js'
import { registerGitTerminalIpc, type GitTerminalIpcBridge } from './gitTerminalCommands.js'
import { registerLifecycleIpc } from './lifecycle.js'
import { registerMenuDispatchIpc } from './menu.js'
import { registerPlatformIpc } from './platform.js'
import { registerSettingsIpc } from './settings.js'
import { registerShellIpc } from './shell.js'
import { registerWindowControlsIpc } from './windowControls.js'
import { registerWorkspaceCommandsIpc, type WorkspaceCommandServices } from './workspaceCommands.js'
import type { MenuDispatchBridge } from '../services/menuDispatch.js'
import { getPlatformInfo } from '../services/platform.js'
export type NativeIpcDependencies = {
  app: Electron.App
  BrowserWindow: typeof Electron.BrowserWindow
  clipboard: Electron.Clipboard
  dialog: Electron.Dialog
  ipcMain: Electron.IpcMain
  getLaunchInfo: () => import('../types.js').AppLaunchInfo
  onRendererReady?: () => void
  shell: Electron.Shell
}
export type NativeIpcRegistration = {
  commands: WorkspaceCommandServices
  gitTerminal: GitTerminalIpcBridge
  menu: MenuDispatchBridge
}
export const registerNativeIpc = (dependencies: NativeIpcDependencies): NativeIpcRegistration => {
  registerAppReadyIpc(dependencies.ipcMain, dependencies.app, dependencies.onRendererReady)
  registerClipboardIpc(dependencies.ipcMain, dependencies.clipboard)
  registerDialogIpc(dependencies.ipcMain, dependencies.dialog, dependencies.BrowserWindow)
  registerLifecycleIpc(dependencies.ipcMain, dependencies.getLaunchInfo)
  registerPlatformIpc(dependencies.ipcMain)
  registerSettingsIpc(dependencies.ipcMain)
  registerShellIpc(dependencies.ipcMain, dependencies.shell)
  registerWindowControlsIpc(dependencies.ipcMain, dependencies.BrowserWindow)
  const commands = registerWorkspaceCommandsIpc(
    dependencies.ipcMain,
    dependencies.app,
    dependencies.BrowserWindow,
    dependencies.shell,
  )
  const gitTerminal = registerGitTerminalIpc(dependencies.ipcMain, dependencies.app, () =>
    commands.workspace.terminalCwd(),
  )
  const menu = registerMenuDispatchIpc(dependencies.ipcMain, () =>
    dependencies.BrowserWindow.getFocusedWindow(),
  )
  registerCommandInvokeIpc(
    dependencies.ipcMain,
    createRuntimeCommandHandlers(commands, gitTerminal, menu, dependencies.onRendererReady),
  )
  return { commands, gitTerminal, menu }
}
const createRuntimeCommandHandlers = (
  commands: WorkspaceCommandServices,
  gitTerminal: GitTerminalIpcBridge,
  menu: MenuDispatchBridge,
  onRendererReady?: () => void,
): NativeCommandHandlers => {
  return {
    ...commands.commandHandlers,
    ...gitTerminal.commandHandlers,
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
