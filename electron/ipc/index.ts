import type * as Electron from 'electron'
import { registerAiIpc, type AiIpcBridge } from '@electron/ipc/ai'
import { registerAiCompletionIpc, type AiCompletionIpcBridge } from '@electron/ipc/aiCompletion'
import { createLocalAiDirectoryPicker } from '@electron/ipc/aiLocalDirectory'
import { registerAppReadyIpc } from '@electron/ipc/appReady'
import { registerClipboardIpc } from '@electron/ipc/clipboard'
import { registerCommandInvokeIpc, type NativeCommandHandlers } from '@electron/ipc/commandInvoke'
import { registerDialogIpc } from '@electron/ipc/dialogs'
import { registerGitNamedIpc } from '@electron/ipc/gitNamed'
import {
  registerGitTerminalIpc,
  type GitTerminalIpcBridge,
} from '@electron/ipc/gitTerminalCommands'
import { registerLifecycleIpc } from '@electron/ipc/lifecycle'
import { registerLanguageIntelligenceIpc } from '@electron/ipc/languageIntelligence'
import { registerLinkPreviewIpc } from '@electron/ipc/linkPreview'
import { registerMenuDispatchIpc } from '@electron/ipc/menu'
import { registerPlatformIpc } from '@electron/ipc/platform'
import { createRendererDiagnosticsHandler } from '@electron/ipc/rendererDiagnostics'
import { registerSettingsIpc } from '@electron/ipc/settings'
import { registerShellIpc } from '@electron/ipc/shell'
import { registerThemeIpc } from '@electron/ipc/themes'
import { registerUpdatesIpc, type UpdaterIpcDependencies } from '@electron/ipc/updates'
import { registerWebTabsIpc } from '@electron/ipc/webTabs'
import { registerWindowControlsIpc } from '@electron/ipc/windowControls'
import {
  registerWindowCloseLifecycleIpc,
  type WindowCloseLifecycleIpcBridge,
} from '@electron/ipc/windowCloseLifecycle'
import { registerWorkspaceNamedIpc } from '@electron/ipc/workspaceNamed'
import { registerWorkspaceSyncIpc } from '@electron/ipc/workspaceSync'
import {
  registerWorkspaceCommandsIpc,
  type WorkspaceCommandServices,
} from '@electron/ipc/workspaceCommands'
import type { ExportService } from '@electron/services/export/exportService'
import type { AiServiceContract } from '@electron/services/ai/types'
import type { AiInlineCompletionServiceContract } from '@electron/services/ai/completion/types'
import type { GitService } from '@electron/services/git/service'
import type { GraphLayoutStore } from '@electron/services/graphLayout/graphLayoutStore'
import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type { LocalAiServiceContract } from '@electron/services/ai/local/types'
import type { LanguageIntelligenceServiceContract } from '@electron/services/languageIntelligence/service'
import type { LinkPreviewServiceContract } from '@electron/services/linkPreview/service'
import type { Logger } from '@electron/services/logger'
import type { MenuDispatchBridge } from '@electron/services/menuDispatch'
import { getPlatformInfo } from '@electron/services/platform'
import { setNativeMenuLocale } from '@electron/menu'
import type { TerminalService } from '@electron/services/terminal/service'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'
import type { WebTabManager } from '@electron/services/webTabs/webTabManager'
import type { WebDavProfileStoreContract } from '@electron/services/sync/webdav/types'
import type { WorkspaceSyncConfigStore } from '@electron/services/sync/workspaceSyncConfig'
import type { WorkspaceSyncCoordinator } from '@electron/services/sync/core/coordinator'
import type { WorkspaceWebDavSyncService } from '@electron/services/sync/workspaceWebDavSyncService'
export type NativeIpcDependencies = {
  aiService: AiServiceContract
  aiInlineCompletionService: AiInlineCompletionServiceContract
  app: Electron.App
  BrowserWindow: typeof Electron.BrowserWindow
  clipboard: Electron.Clipboard
  dialog: Electron.Dialog
  ipcMain: Electron.IpcMain
  getLaunchInfo: () => import('@electron/types').AppLaunchInfo
  exportService: ExportService
  gitService: GitService
  graphLayoutStore: GraphLayoutStore
  knowledgeEngineService: KnowledgeEngineService
  languageIntelligenceService: LanguageIntelligenceServiceContract
  linkPreviewService: LinkPreviewServiceContract
  logger: Logger
  localHistoryService: LocalHistoryServiceContract
  localAiService: LocalAiServiceContract
  onRendererReady?: () => void
  shell: Electron.Shell
  terminalService: TerminalService
  webDavProfileStore: WebDavProfileStoreContract
  webTabManager: WebTabManager
  workspaceSyncConfigStore: WorkspaceSyncConfigStore
  workspaceSyncCoordinator: WorkspaceSyncCoordinator
  workspaceWebDavSyncService: WorkspaceWebDavSyncService
  updates?: Pick<UpdaterIpcDependencies, 'onBeforeInstall'>
  workspaceRegistry: WindowWorkspaceRegistry
  windowCommandHandlers?: NativeCommandHandlers
}
export type NativeIpcRegistration = {
  ai: AiIpcBridge
  aiCompletion: AiCompletionIpcBridge
  commands: WorkspaceCommandServices
  gitTerminal: GitTerminalIpcBridge
  menu: MenuDispatchBridge
  windowClose: WindowCloseLifecycleIpcBridge
}
export const registerNativeIpc = (dependencies: NativeIpcDependencies): NativeIpcRegistration => {
  const logger = dependencies.logger.child('ipc')
  registerAppReadyIpc(dependencies.ipcMain, dependencies.app, dependencies.onRendererReady)
  registerClipboardIpc(dependencies.ipcMain, dependencies.clipboard)
  registerDialogIpc(dependencies.ipcMain, dependencies.dialog, dependencies.BrowserWindow)
  registerLifecycleIpc(dependencies.ipcMain, dependencies.getLaunchInfo)
  registerLanguageIntelligenceIpc(
    dependencies.ipcMain,
    dependencies.languageIntelligenceService,
    dependencies.workspaceRegistry,
    logger.child('language-intelligence'),
  )
  registerLinkPreviewIpc(
    dependencies.ipcMain,
    dependencies.linkPreviewService,
    dependencies.workspaceRegistry,
    dependencies.BrowserWindow,
  )
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
  registerWebTabsIpc(dependencies.ipcMain, {
    BrowserWindow: dependencies.BrowserWindow,
    manager: dependencies.webTabManager,
    workspaceRegistry: dependencies.workspaceRegistry,
  })
  registerWindowControlsIpc(dependencies.ipcMain, dependencies.BrowserWindow)
  const windowClose = registerWindowCloseLifecycleIpc(dependencies.ipcMain)
  registerGitNamedIpc(dependencies.ipcMain, {
    gitService: dependencies.gitService,
    workspaceMutationCoordinator: dependencies.workspaceSyncCoordinator,
    workspaceRegistry: dependencies.workspaceRegistry,
  })
  registerWorkspaceNamedIpc(dependencies.ipcMain, {
    clipboard: dependencies.clipboard,
    shell: dependencies.shell,
    workspaceRegistry: dependencies.workspaceRegistry,
  })
  registerWorkspaceSyncIpc(dependencies.ipcMain, {
    configStore: dependencies.workspaceSyncConfigStore,
    gitService: dependencies.gitService,
    profileStore: dependencies.webDavProfileStore,
    syncService: dependencies.workspaceWebDavSyncService,
    workspaceMutationCoordinator: dependencies.workspaceSyncCoordinator,
    workspaceRegistry: dependencies.workspaceRegistry,
  })
  const ai = registerAiIpc(
    dependencies.ipcMain,
    dependencies.aiService,
    logger.child('ai'),
    dependencies.localAiService,
    createLocalAiDirectoryPicker(dependencies.dialog, dependencies.BrowserWindow),
  )
  const aiCompletion = registerAiCompletionIpc(
    dependencies.ipcMain,
    dependencies.aiInlineCompletionService,
    logger.child('ai-completion'),
  )
  const commands = registerWorkspaceCommandsIpc(dependencies.ipcMain, {
    exportService: dependencies.exportService,
    graphLayoutStore: dependencies.graphLayoutStore,
    localHistoryService: dependencies.localHistoryService,
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
      ai,
      gitTerminal,
      menu,
      dependencies.knowledgeEngineService.commandHandlers,
      dependencies.windowCommandHandlers,
      dependencies.onRendererReady,
      logger.child('renderer'),
    ),
    logger.child('command-invoke'),
  )
  logger.info('native IPC registered')
  return { ai, aiCompletion, commands, gitTerminal, menu, windowClose }
}
const createRuntimeCommandHandlers = (
  commands: WorkspaceCommandServices,
  ai: AiIpcBridge,
  gitTerminal: GitTerminalIpcBridge,
  menu: MenuDispatchBridge,
  knowledgeEngineCommandHandlers: NativeCommandHandlers,
  windowCommandHandlers: NativeCommandHandlers = {},
  onRendererReady?: () => void,
  rendererLogger?: Logger,
): NativeCommandHandlers => {
  return {
    ...ai.commandHandlers,
    ...commands.commandHandlers,
    ...gitTerminal.commandHandlers,
    ...knowledgeEngineCommandHandlers,
    ...windowCommandHandlers,
    ...(rendererLogger
      ? { diagnostics_renderer_report: createRendererDiagnosticsHandler(rendererLogger) }
      : {}),
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
    menu_set_locale: (payload) => setNativeMenuLocale(menuLocale(payload)),
  }
}
const menuActionId = (payload: unknown): string => {
  const id = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).id : null
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('menu_dispatch requires an id string')
  }
  return id
}

const menuLocale = (payload: unknown): string => {
  const locale =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>).locale : null
  if (typeof locale !== 'string' || !locale.trim()) {
    throw new Error('menu_set_locale requires a locale string')
  }
  return locale
}
