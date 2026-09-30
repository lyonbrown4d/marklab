import { asFunction, asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix'
import type * as Electron from 'electron'

import { AiService } from '@electron/services/ai/aiService.js'
import { AiProviderStore } from '@electron/services/ai/providerStore.js'
import { VercelAiProviderResolver } from '@electron/services/ai/providerResolver.js'
import type {
  AiModelResolverContract,
  AiProviderStoreContract,
  AiServiceContract,
} from '@electron/services/ai/types.js'
import { ExportService } from '@electron/services/export/exportService.js'
import { GitService } from '@electron/services/git/service.js'
import { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import { KnowledgeEngineWorkspaceSearchBackend } from '@electron/services/knowledgeEngine/workspaceSearchBackend.js'
import { LocalHistoryService } from '@electron/services/localHistory/service.js'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types.js'
import { createElectronLogger, type Logger } from '@electron/services/logger.js'
import {
  configureSettingsStoreLogger,
  removeRendererSession,
} from '@electron/services/settingsStore.js'
import { configureUserThemeStoreLogger } from '@electron/services/userThemeStore.js'
import { TerminalService } from '@electron/services/terminal/service.js'
import { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry.js'
import { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex.js'
import type { WorkspaceSearchIndexFactory } from '@electron/services/workspace/workspaceAnalysisService.js'
import type { AppLaunchInfo } from '@electron/types.js'

export type ElectronRuntimeDependencies = {
  app: Electron.App
  BrowserWindow: typeof Electron.BrowserWindow
  clipboard: Electron.Clipboard
  dialog: Electron.Dialog
  getLaunchInfo: () => AppLaunchInfo
  ipcMain: Electron.IpcMain
  onRendererReady?: () => void
  safeStorage: Electron.SafeStorage
  shell: Electron.Shell
}

export type ElectronCradle = ElectronRuntimeDependencies & {
  aiModelResolver: AiModelResolverContract
  aiProviderStore: AiProviderStoreContract
  aiService: AiServiceContract
  exportService: ExportService
  gitService: GitService
  knowledgeEngineService: KnowledgeEngineService
  logger: Logger
  localHistoryService: LocalHistoryServiceContract
  terminalService: TerminalService
  workspaceRegistry: WindowWorkspaceRegistry
  workspaceSearchIndexFactory: WorkspaceSearchIndexFactory
}

export type ElectronContainer = AwilixContainer<ElectronCradle>

export const createElectronContainer = (
  dependencies: ElectronRuntimeDependencies,
): ElectronContainer => {
  const logger = createElectronLogger({ isPackaged: dependencies.app.isPackaged }).child('main')
  configureSettingsStoreLogger(logger.child('settings'))
  configureUserThemeStoreLogger(logger.child('themes'))

  const container = createContainer<ElectronCradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  })

  container.register({
    app: asValue(dependencies.app),
    BrowserWindow: asValue(dependencies.BrowserWindow),
    clipboard: asValue(dependencies.clipboard),
    dialog: asValue(dependencies.dialog),
    getLaunchInfo: asValue(dependencies.getLaunchInfo),
    ipcMain: asValue(dependencies.ipcMain),
    onRendererReady: asValue(dependencies.onRendererReady ?? (() => undefined)),
    safeStorage: asValue(dependencies.safeStorage),
    shell: asValue(dependencies.shell),
    logger: asValue(logger),
    aiProviderStore: asFunction(({ app, safeStorage }) => {
      return new AiProviderStore(app.getPath('userData'), safeStorage)
    }).singleton(),
    aiModelResolver: asFunction(() => new VercelAiProviderResolver()).singleton(),
    aiService: asFunction(({ aiModelResolver, aiProviderStore }) => {
      return new AiService({ resolver: aiModelResolver, store: aiProviderStore })
    }).singleton(),
    localHistoryService: asFunction(({ app }) => {
      return new LocalHistoryService({ userDataPath: app.getPath('userData') })
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
  })

  return container
}
