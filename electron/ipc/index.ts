import type * as Electron from 'electron'
import { registerAiIpc, type AiIpcBridge } from '@electron/ipc/ai.js'
import { registerAiCompletionIpc, type AiCompletionIpcBridge } from '@electron/ipc/aiCompletion.js'
import { createLocalAiDirectoryPicker } from '@electron/ipc/aiLocalDirectory.js'
import { registerAppReadyIpc } from '@electron/ipc/appReady.js'
import { registerClipboardIpc } from '@electron/ipc/clipboard.js'
import {
  registerCommandInvokeIpc,
  type NativeCommandHandlers,
} from '@electron/ipc/commandInvoke.js'
import { registerDialogIpc } from '@electron/ipc/dialogs.js'
import { registerGitNamedIpc } from '@electron/ipc/gitNamed.js'
import {
  registerGitTerminalIpc,
  type GitTerminalIpcBridge,
} from '@electron/ipc/gitTerminalCommands.js'
import { registerLifecycleIpc } from '@electron/ipc/lifecycle.js'
import { registerLanguageIntelligenceIpc } from '@electron/ipc/languageIntelligence.js'
import { registerLinkPreviewIpc } from '@electron/ipc/linkPreview.js'
import { registerMenuDispatchIpc } from '@electron/ipc/menu.js'
import { registerPlatformIpc } from '@electron/ipc/platform.js'
import { registerSettingsIpc } from '@electron/ipc/settings.js'
import { registerShellIpc } from '@electron/ipc/shell.js'
import { registerThemeIpc } from '@electron/ipc/themes.js'
import { registerUpdatesIpc, type UpdaterIpcDependencies } from '@electron/ipc/updates.js'
import { registerWindowControlsIpc } from '@electron/ipc/windowControls.js'
import {
  registerWindowCloseLifecycleIpc,
  type WindowCloseLifecycleIpcBridge,
} from '@electron/ipc/windowCloseLifecycle.js'
import { registerWorkspaceNamedIpc } from '@electron/ipc/workspaceNamed.js'
import { registerWorkspaceSyncIpc } from '@electron/ipc/workspaceSync.js'
import {
  registerWorkspaceCommandsIpc,
  type WorkspaceCommandServices,
} from '@electron/ipc/workspaceCommands.js'
import type { ExportService } from '@electron/services/export/exportService.js'
import type { AiServiceContract } from '@electron/services/ai/types.js'
import type { AiInlineCompletionServiceContract } from '@electron/services/ai/completion/types.js'
import type { GitService } from '@electron/services/git/service.js'
import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types.js'
import type { LocalAiServiceContract } from '@electron/services/ai/local/types.js'
import type { LanguageIntelligenceServiceContract } from '@electron/services/languageIntelligence/service.js'
import type { LinkPreviewServiceContract } from '@electron/services/linkPreview/service.js'
import type { Logger } from '@electron/services/logger.js'
import type { MenuDispatchBridge } from '@electron/services/menuDispatch.js'
import { getPlatformInfo } from '@electron/services/platform.js'
import { setNativeMenuLocale } from '@electron/menu.js'
import type { TerminalService } from '@electron/services/terminal/service.js'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry.js'
import type { WebDavProfileStoreContract } from '@electron/services/sync/webdav/types.js'
import type { WorkspaceSyncConfigStore } from '@electron/services/sync/workspaceSyncConfig.js'
import type { WorkspaceWebDavSyncService } from '@electron/services/sync/workspaceWebDavSyncService.js'
export type NativeIpcDependencies = {
  aiService: AiServiceContract
  aiInlineCompletionService: AiInlineCompletionServiceContract
  app: Electron.App
  BrowserWindow: typeof Electron.BrowserWindow
  clipboard: Electron.Clipboard
  dialog: Electron.Dialog
  ipcMain: Electron.IpcMain
  getLaunchInfo: () => import('@electron/types.js').AppLaunchInfo
  exportService: ExportService
  gitService: GitService
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
  workspaceSyncConfigStore: WorkspaceSyncConfigStore
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
  registerWindowControlsIpc(dependencies.ipcMain, dependencies.BrowserWindow)
  const windowClose = registerWindowCloseLifecycleIpc(dependencies.ipcMain)
  registerGitNamedIpc(dependencies.ipcMain, {
    gitService: dependencies.gitService,
    workspaceRegistry: dependencies.workspaceRegistry,
  })
  registerWorkspaceNamedIpc(dependencies.ipcMain, {
    clipboard: dependencies.clipboard,
    shell: dependencies.shell,
    workspaceRegistry: dependencies.workspaceRegistry,
  })
  registerWorkspaceSyncIpc(dependencies.ipcMain, {
    configStore: dependencies.workspaceSyncConfigStore,
    profileStore: dependencies.webDavProfileStore,
    syncService: dependencies.workspaceWebDavSyncService,
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
): NativeCommandHandlers => {
  return {
    ...ai.commandHandlers,
    ...commands.commandHandlers,
    ...gitTerminal.commandHandlers,
    ...knowledgeEngineCommandHandlers,
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
