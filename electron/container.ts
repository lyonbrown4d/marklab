import { asFunction, asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix'
import type * as Electron from 'electron'

import { ExportService } from '@electron/services/export/exportService.js'
import { GitService } from '@electron/services/git/service.js'
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
  shell: Electron.Shell
}

export type ElectronCradle = ElectronRuntimeDependencies & {
  exportService: ExportService
  gitService: GitService
  logger: Logger
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
    shell: asValue(dependencies.shell),
    logger: asValue(logger),
    workspaceSearchIndexFactory: asFunction(() => {
      return () => new WorkspaceSearchIndex()
    }).singleton(),
    workspaceRegistry: asFunction(({ app, logger, shell, workspaceSearchIndexFactory }) => {
      return new WindowWorkspaceRegistry(app, shell, logger.child('workspace'), {
        onSessionDisposed: removeRendererSession,
        workspaceSearchIndexFactory,
      })
    }).singleton(),
    exportService: asFunction(({ BrowserWindow, logger, shell }) => {
      return new ExportService(shell, BrowserWindow, logger.child('export'))
    }).singleton(),
    gitService: asFunction(({ logger }) => {
      return new GitService(logger.child('git'))
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
