import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type { ElectronContainer } from '@electron/container.js'
import { registerNativeIpc, type NativeIpcRegistration } from '@electron/ipc/index.js'
import { getLaunchInfo } from '@electron/main/deepLinks.js'

type RegisterNativeIpcOptions = Parameters<typeof registerNativeIpc>[0]

type MainNativeIpcOptions = {
  container: ElectronContainer
  flushWorkspaceBuffers: (reason: string) => Promise<void>
  onRendererReady: () => void
  windowCommandHandlers: RegisterNativeIpcOptions['windowCommandHandlers']
}

export const registerMainNativeIpc = (options: MainNativeIpcOptions): NativeIpcRegistration => {
  const { container } = options

  return registerNativeIpc({
    app,
    BrowserWindow,
    clipboard,
    dialog,
    exportService: container.cradle.exportService,
    gitService: container.cradle.gitService,
    getLaunchInfo,
    ipcMain,
    logger: container.cradle.logger,
    onRendererReady: options.onRendererReady,
    shell,
    terminalService: container.cradle.terminalService,
    updates: {
      onBeforeInstall: () => options.flushWorkspaceBuffers('update install'),
    },
    windowCommandHandlers: options.windowCommandHandlers,
    workspaceRegistry: container.cradle.workspaceRegistry,
  })
}
