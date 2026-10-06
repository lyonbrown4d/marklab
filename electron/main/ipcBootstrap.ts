import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { registerNativeIpc, type NativeIpcRegistration } from '@electron/ipc/index'
import { getLaunchInfo } from '@electron/main/deepLinks'

type RegisterNativeIpcOptions = Parameters<typeof registerNativeIpc>[0]

type MainIpcServices = Pick<
  RegisterNativeIpcOptions,
  | 'aiInlineCompletionService'
  | 'aiService'
  | 'exportService'
  | 'gitService'
  | 'graphLayoutStore'
  | 'knowledgeEngineService'
  | 'languageIntelligenceService'
  | 'linkPreviewService'
  | 'localHistoryService'
  | 'logger'
  | 'terminalService'
  | 'webDavProfileStore'
  | 'webTabManager'
  | 'workspaceRegistry'
  | 'workspaceSyncConfigStore'
  | 'workspaceSyncCoordinator'
  | 'workspaceWebDavSyncService'
>

type MainNativeIpcOptions = {
  flushWorkspaceBuffers: (reason: string) => Promise<void>
  onRendererReady: () => void
  services: MainIpcServices
  windowCommandHandlers: RegisterNativeIpcOptions['windowCommandHandlers']
}

export const registerMainNativeIpc = (options: MainNativeIpcOptions): NativeIpcRegistration => {
  const { services } = options

  return registerNativeIpc({
    aiService: services.aiService,
    aiInlineCompletionService: services.aiInlineCompletionService,
    app,
    BrowserWindow,
    clipboard,
    dialog,
    exportService: services.exportService,
    gitService: services.gitService,
    graphLayoutStore: services.graphLayoutStore,
    knowledgeEngineService: services.knowledgeEngineService,
    languageIntelligenceService: services.languageIntelligenceService,
    linkPreviewService: services.linkPreviewService,
    localHistoryService: services.localHistoryService,
    getLaunchInfo,
    ipcMain,
    logger: services.logger,
    onRendererReady: options.onRendererReady,
    shell,
    terminalService: services.terminalService,
    webDavProfileStore: services.webDavProfileStore,
    webTabManager: services.webTabManager,
    workspaceSyncConfigStore: services.workspaceSyncConfigStore,
    workspaceSyncCoordinator: services.workspaceSyncCoordinator,
    workspaceWebDavSyncService: services.workspaceWebDavSyncService,
    updates: {
      onBeforeInstall: () => options.flushWorkspaceBuffers('update install'),
    },
    windowCommandHandlers: options.windowCommandHandlers,
    workspaceRegistry: services.workspaceRegistry,
  })
}
