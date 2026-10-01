import { asFunction, asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix'
import type * as Electron from 'electron'
import path from 'node:path'

import { AiService } from '@electron/services/ai/aiService.js'
import { AiInlineCompletionService } from '@electron/services/ai/completion/service.js'
import type { AiInlineCompletionServiceContract } from '@electron/services/ai/completion/types.js'
import {
  AiInlineCompletionPolicy,
  type AiInlineCompletionPolicyContract,
} from '@electron/services/ai/completion/policy.js'
import { LOCAL_AI_MODEL_CATALOG } from '@electron/services/ai/local/catalog.js'
import { LocalAiDirectoryStore } from '@electron/services/ai/local/directoryStore.js'
import { LocalAiModelManager } from '@electron/services/ai/local/modelManager.js'
import { LocalAiService } from '@electron/services/ai/local/service.js'
import type {
  LocalAiModelManagerContract,
  LocalAiRuntimeContract,
  LocalAiServiceContract,
} from '@electron/services/ai/local/types.js'
import { UtilityLocalAiRuntime } from '@electron/services/ai/local/utilityRuntime.js'
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
  localAiModelManager: LocalAiModelManagerContract
  localAiDirectoryStore: LocalAiDirectoryStore
  localAiRuntime: LocalAiRuntimeContract
  localAiService: LocalAiServiceContract
  aiProviderStore: AiProviderStoreContract
  aiService: AiServiceContract
  aiInlineCompletionService: AiInlineCompletionServiceContract
  aiInlineCompletionPolicy: AiInlineCompletionPolicyContract
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
    localAiDirectoryStore: asFunction(({ app }) => {
      return new LocalAiDirectoryStore(app.getPath('userData'))
    }).singleton(),
    localAiModelManager: asFunction(({ app, localAiDirectoryStore }) => {
      return new LocalAiModelManager({
        catalog: LOCAL_AI_MODEL_CATALOG,
        forbiddenModelDirectories: packagedApplicationDirectories(app),
        initialDirectoryPreference: localAiDirectoryStore.getConfig(),
        initialDeviceId: localAiDirectoryStore.getDeviceId(),
        initialMigration: localAiDirectoryStore.getMigration(),
        userDataPath: app.getPath('userData'),
      })
    }).singleton(),
    localAiRuntime: asFunction(() => new UtilityLocalAiRuntime()).singleton(),
    localAiService: asFunction(({ localAiDirectoryStore, localAiModelManager, localAiRuntime }) => {
      return new LocalAiService({
        modelManager: localAiModelManager,
        persistMigration: (migration) => localAiDirectoryStore.recordMigration(migration),
        persistModelDirectory: (config) => localAiDirectoryStore.commit(config),
        runtime: localAiRuntime,
      })
    }).singleton(),
    aiInlineCompletionPolicy: asFunction(({ aiProviderStore }) => {
      return new AiInlineCompletionPolicy({ providerStore: aiProviderStore })
    }).singleton(),
    aiInlineCompletionService: asFunction(
      ({ aiInlineCompletionPolicy, aiService, localAiService }) => {
        return new AiInlineCompletionService({
          aiService,
          localAiService,
          policy: aiInlineCompletionPolicy,
        })
      },
    ).singleton(),
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

const packagedApplicationDirectories = (app: Electron.App): string[] => {
  if (!app.isPackaged) return []
  const directories = [app.getAppPath(), path.dirname(app.getPath('exe'))]
  if (process.platform !== 'darwin') return directories
  let current = path.resolve(app.getPath('exe'))
  while (path.dirname(current) !== current) {
    if (current.toLowerCase().endsWith('.app')) return [...directories, current]
    current = path.dirname(current)
  }
  return directories
}
