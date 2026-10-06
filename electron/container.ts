import { asFunction, asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix'
import type * as Electron from 'electron'
import path from 'node:path'

import { LocalDatabaseService } from '@electron/database/service'
import { LifecycleCoordinator } from '@electron/main/lifecycle/lifecycleCoordinator'
import { createMainLifecycleTasks } from '@electron/main/lifecycle/mainLifecycleTasks'
import type { LifecycleTask } from '@electron/main/lifecycle/types'
import { AiService } from '@electron/services/ai/aiService'
import { AiInlineCompletionService } from '@electron/services/ai/completion/service'
import type { AiInlineCompletionServiceContract } from '@electron/services/ai/completion/types'
import {
  AiInlineCompletionPolicy,
  type AiInlineCompletionPolicyContract,
} from '@electron/services/ai/completion/policy'
import { AiProviderStore } from '@electron/services/ai/providerStore'
import { VercelAiProviderResolver } from '@electron/services/ai/providerResolver'
import type {
  AiModelResolverContract,
  AiProviderStoreContract,
  AiServiceContract,
} from '@electron/services/ai/types'
import { ExportService } from '@electron/services/export/exportService'
import { GitService } from '@electron/services/git/service'
import { GraphLayoutStore } from '@electron/services/graphLayout/graphLayoutStore'
import { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import { KnowledgeEngineWorkspaceSearchBackend } from '@electron/services/knowledgeEngine/workspaceSearchBackend'
import { LocalHistoryService } from '@electron/services/localHistory/service'
import { LanguageIntelligenceService } from '@electron/services/languageIntelligence/service'
import type { LanguageIntelligenceServiceContract } from '@electron/services/languageIntelligence/service'
import {
  LinkPreviewService,
  type LinkPreviewServiceContract,
} from '@electron/services/linkPreview/service'
import { defaultLinkPreviewLookup } from '@electron/services/linkPreview/networkSecurity'
import { WebPreviewCapturePool } from '@electron/services/linkPreview/webPreviewCapturePool'
import { WebPreviewDiskCache } from '@electron/services/linkPreview/webPreviewDiskCache'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import { createElectronLogger, type Logger } from '@electron/services/logger'
import {
  configureSettingsStore,
  removeRendererSession,
  SettingsStore,
} from '@electron/services/settingsStore'
import { configureUserThemeStoreLogger } from '@electron/services/userThemeStore'
import { TerminalService } from '@electron/services/terminal/service'
import { WorkspaceSyncCoordinator } from '@electron/services/sync/core/coordinator'
import { WebDavProfileStore } from '@electron/services/sync/webdav/profileStore'
import { FileLocalSyncStateStore } from '@electron/services/sync/webdavSync/stateStore'
import { WorkspaceSyncConfigStore } from '@electron/services/sync/workspaceSyncConfig'
import { WorkspaceWebDavSyncService } from '@electron/services/sync/workspaceWebDavSyncService'
import { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'
import { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex'
import type { WorkspaceSearchIndexFactory } from '@electron/services/workspace/workspaceAnalysisService'
import { WebTabManager } from '@electron/services/webTabs/webTabManager'
import type { AppLaunchInfo } from '@electron/types'

export type ElectronRuntimeDependencies = {
  app: Electron.App
  BrowserWindow: typeof Electron.BrowserWindow
  WebContentsView: typeof Electron.WebContentsView
  clipboard: Electron.Clipboard
  dialog: Electron.Dialog
  getLaunchInfo: () => AppLaunchInfo
  ipcMain: Electron.IpcMain
  lifecycleTasks?: readonly LifecycleTask[]
  onRendererReady?: () => void
  safeStorage: Electron.SafeStorage
  shell: Electron.Shell
}

export type ElectronCradle = Omit<ElectronRuntimeDependencies, 'lifecycleTasks'> & {
  aiModelResolver: AiModelResolverContract
  aiProviderStore: AiProviderStoreContract
  aiService: AiServiceContract
  aiInlineCompletionService: AiInlineCompletionServiceContract
  aiInlineCompletionPolicy: AiInlineCompletionPolicyContract
  exportService: ExportService
  gitService: GitService
  graphLayoutStore: GraphLayoutStore
  knowledgeEngineService: KnowledgeEngineService
  lifecycleCoordinator: LifecycleCoordinator
  logger: Logger
  localHistoryService: LocalHistoryServiceContract
  languageIntelligenceService: LanguageIntelligenceServiceContract
  linkPreviewService: LinkPreviewServiceContract
  localDatabaseService: LocalDatabaseService
  terminalService: TerminalService
  webTabManager: WebTabManager
  webDavProfileStore: WebDavProfileStore
  webDavSyncStateStore: FileLocalSyncStateStore
  workspaceSyncConfigStore: WorkspaceSyncConfigStore
  workspaceSyncCoordinator: WorkspaceSyncCoordinator
  workspaceWebDavSyncService: WorkspaceWebDavSyncService
  workspaceRegistry: WindowWorkspaceRegistry
  workspaceSearchIndexFactory: WorkspaceSearchIndexFactory
  settingsStore: SettingsStore
}

export type ElectronContainer = AwilixContainer<ElectronCradle>

export const createElectronContainer = (
  dependencies: ElectronRuntimeDependencies,
): ElectronContainer => {
  const logger = createElectronLogger({ isPackaged: dependencies.app.isPackaged }).child('main')
  configureUserThemeStoreLogger(logger.child('themes'))

  const container = createContainer<ElectronCradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  })

  container.register({
    app: asValue(dependencies.app),
    BrowserWindow: asValue(dependencies.BrowserWindow),
    WebContentsView: asValue(dependencies.WebContentsView),
    clipboard: asValue(dependencies.clipboard),
    dialog: asValue(dependencies.dialog),
    getLaunchInfo: asValue(dependencies.getLaunchInfo),
    ipcMain: asValue(dependencies.ipcMain),
    onRendererReady: asValue(dependencies.onRendererReady ?? (() => undefined)),
    safeStorage: asValue(dependencies.safeStorage),
    shell: asValue(dependencies.shell),
    logger: asValue(logger),
    localDatabaseService: asFunction(({ app }) => {
      return new LocalDatabaseService({ userDataPath: app.getPath('userData') })
    }).singleton(),
    lifecycleCoordinator: asFunction((cradle) => {
      return new LifecycleCoordinator({
        logger: cradle.logger,
        tasks: [
          ...createMainLifecycleTasks({
            configureSettingsStore,
            getKnowledgeEngineService: () => cradle.knowledgeEngineService,
            getLinkPreviewService: () => cradle.linkPreviewService,
            getLocalHistoryService: () => cradle.localHistoryService,
            getSettingsStore: () => cradle.settingsStore,
            localDatabaseService: cradle.localDatabaseService,
          }),
          ...(dependencies.lifecycleTasks ?? []),
        ],
      })
    }).singleton(),
    settingsStore: asFunction(({ localDatabaseService }) => {
      return new SettingsStore(localDatabaseService)
    }).singleton(),
    aiProviderStore: asFunction(({ localDatabaseService, safeStorage }) => {
      return new AiProviderStore(localDatabaseService, safeStorage)
    }).singleton(),
    aiModelResolver: asFunction(() => new VercelAiProviderResolver()).singleton(),
    aiService: asFunction(({ aiModelResolver, aiProviderStore }) => {
      return new AiService({ resolver: aiModelResolver, store: aiProviderStore })
    }).singleton(),
    aiInlineCompletionPolicy: asFunction(({ aiProviderStore }) => {
      return new AiInlineCompletionPolicy({ providerStore: aiProviderStore })
    }).singleton(),
    aiInlineCompletionService: asFunction(({ aiInlineCompletionPolicy, aiService }) => {
      return new AiInlineCompletionService({
        aiService,
        policy: aiInlineCompletionPolicy,
      })
    }).singleton(),
    localHistoryService: asFunction(({ app }) => {
      return new LocalHistoryService({ userDataPath: app.getPath('userData') })
    }).singleton(),
    languageIntelligenceService: asFunction(() => new LanguageIntelligenceService()).singleton(),
    linkPreviewService: asFunction(({ app, logger, WebContentsView }) => {
      const cache = new WebPreviewDiskCache({
        logger: logger.child('web-preview-cache'),
        root: path.join(app.getPath('userData'), 'cache', 'web-previews'),
      })
      cache.startMaintenance()
      const captureService = new WebPreviewCapturePool({
        WebContentsView,
        cache,
        lookup: defaultLinkPreviewLookup,
        maxConcurrency: 2,
      })
      return new LinkPreviewService({ captureService, logger: logger.child('link-preview') })
    }).singleton(),
    webTabManager: asFunction(({ WebContentsView }) => {
      return new WebTabManager({ WebContentsView })
    }).singleton(),
    workspaceSearchIndexFactory: asFunction(({ knowledgeEngineService }) => {
      return () =>
        new WorkspaceSearchIndex(new KnowledgeEngineWorkspaceSearchBackend(knowledgeEngineService))
    }).singleton(),
    workspaceRegistry: asFunction(
      ({
        app,
        knowledgeEngineService,
        localHistoryService,
        logger,
        shell,
        workspaceSearchIndexFactory,
      }) => {
        return new WindowWorkspaceRegistry(app, shell, logger.child('workspace'), {
          knowledgeEngineService,
          localHistoryService,
          onSessionDisposed: removeRendererSession,
          workspaceSearchIndexFactory,
        })
      },
    ).singleton(),
    exportService: asFunction(({ BrowserWindow, logger, shell }) => {
      return new ExportService(shell, BrowserWindow, logger.child('export'))
    }).singleton(),
    gitService: asFunction(({ logger }) => {
      return new GitService(logger.child('git'))
    }).singleton(),
    graphLayoutStore: asFunction(({ localDatabaseService }) => {
      return new GraphLayoutStore(localDatabaseService)
    }).singleton(),
    knowledgeEngineService: asFunction(({ app, logger }) => {
      return new KnowledgeEngineService({ app, logger: logger.child('knowledge-engine') })
    }).singleton(),
    terminalService: asFunction(({ app, logger, workspaceRegistry }) => {
      return new TerminalService(
        (webContents) =>
          workspaceRegistry.terminalCwdForWebContents(webContents) || app.getPath('home'),
        logger.child('terminal'),
      )
    }).singleton(),
    webDavProfileStore: asFunction(({ localDatabaseService, safeStorage }) => {
      return new WebDavProfileStore(localDatabaseService, safeStorage)
    }).singleton(),
    webDavSyncStateStore: asFunction(({ localDatabaseService }) => {
      return new FileLocalSyncStateStore(localDatabaseService)
    }).singleton(),
    workspaceSyncConfigStore: asFunction(({ localDatabaseService }) => {
      return new WorkspaceSyncConfigStore(localDatabaseService)
    }).singleton(),
    workspaceSyncCoordinator: asFunction(() => new WorkspaceSyncCoordinator()).singleton(),
    workspaceWebDavSyncService: asFunction(
      ({
        webDavProfileStore,
        webDavSyncStateStore,
        workspaceSyncConfigStore,
        workspaceSyncCoordinator,
      }) => {
        return new WorkspaceWebDavSyncService({
          configStore: workspaceSyncConfigStore,
          coordinator: workspaceSyncCoordinator,
          profileStore: webDavProfileStore,
          stateStore: webDavSyncStateStore,
        })
      },
    ).singleton(),
  })

  return container
}
