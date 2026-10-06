import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type { ElectronContainer } from '@electron/container'
import { registerNativeIpc, type NativeIpcRegistration } from '@electron/ipc/index'
import { getLaunchInfo } from '@electron/main/deepLinks'

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
    aiService: container.cradle.aiService,
    aiInlineCompletionService: container.cradle.aiInlineCompletionService,
    app,
    BrowserWindow,
    clipboard,
    dialog,
    exportService: container.cradle.exportService,
    gitService: container.cradle.gitService,
    graphLayoutStore: container.cradle.graphLayoutStore,
    knowledgeEngineService: container.cradle.knowledgeEngineService,
    languageIntelligenceService: container.cradle.languageIntelligenceService,
    linkPreviewService: container.cradle.linkPreviewService,
    localHistoryService: container.cradle.localHistoryService,
    getLaunchInfo,
    ipcMain,
    logger: container.cradle.logger,
    onRendererReady: options.onRendererReady,
    shell,
    terminalService: container.cradle.terminalService,
    webDavProfileStore: container.cradle.webDavProfileStore,
    webTabManager: container.cradle.webTabManager,
    workspaceSyncConfigStore: container.cradle.workspaceSyncConfigStore,
    workspaceSyncCoordinator: container.cradle.workspaceSyncCoordinator,
    workspaceWebDavSyncService: container.cradle.workspaceWebDavSyncService,
    updates: {
      onBeforeInstall: () => options.flushWorkspaceBuffers('update install'),
    },
    windowCommandHandlers: options.windowCommandHandlers,
    workspaceRegistry: container.cradle.workspaceRegistry,
  })
}
