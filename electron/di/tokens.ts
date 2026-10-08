import type { ServiceIdentifier } from 'inversify'

import type { ElectronBindings } from '@electron/di/types'

declare const electronTokenType: unique symbol

export type ElectronToken<T> = ServiceIdentifier<T> & {
  readonly [electronTokenType]?: T
}

const token = <T>(name: string): ElectronToken<T> =>
  Symbol(`marklab.electron.${name}`) as ElectronToken<T>

export const TOKENS = {
  app: token<ElectronBindings['app']>('app'),
  BrowserWindow: token<ElectronBindings['BrowserWindow']>('BrowserWindow'),
  WebContentsView: token<ElectronBindings['WebContentsView']>('WebContentsView'),
  safeStorage: token<ElectronBindings['safeStorage']>('safeStorage'),
  shell: token<ElectronBindings['shell']>('shell'),
  lifecycleTasks: token<ElectronBindings['lifecycleTasks']>('lifecycleTasks'),
  logger: token<ElectronBindings['logger']>('logger'),
  localDatabaseService: token<ElectronBindings['localDatabaseService']>('localDatabaseService'),
  settingsStore: token<ElectronBindings['settingsStore']>('settingsStore'),
  aiProviderStore: token<ElectronBindings['aiProviderStore']>('aiProviderStore'),
  aiModelResolver: token<ElectronBindings['aiModelResolver']>('aiModelResolver'),
  aiService: token<ElectronBindings['aiService']>('aiService'),
  aiInlineCompletionPolicy: token<ElectronBindings['aiInlineCompletionPolicy']>(
    'aiInlineCompletionPolicy',
  ),
  aiInlineCompletionService: token<ElectronBindings['aiInlineCompletionService']>(
    'aiInlineCompletionService',
  ),
  localHistoryService: token<ElectronBindings['localHistoryService']>('localHistoryService'),
  languageIntelligenceService: token<ElectronBindings['languageIntelligenceService']>(
    'languageIntelligenceService',
  ),
  linkPreviewService: token<ElectronBindings['linkPreviewService']>('linkPreviewService'),
  webTabManager: token<ElectronBindings['webTabManager']>('webTabManager'),
  workspaceSearchIndexFactory: token<ElectronBindings['workspaceSearchIndexFactory']>(
    'workspaceSearchIndexFactory',
  ),
  workspaceAnalysisScheduler: token<ElectronBindings['workspaceAnalysisScheduler']>(
    'workspaceAnalysisScheduler',
  ),
  workspaceGraphScheduler:
    token<ElectronBindings['workspaceGraphScheduler']>('workspaceGraphScheduler'),
  workspaceGraphStore: token<ElectronBindings['workspaceGraphStore']>('workspaceGraphStore'),
  workspaceRegistry: token<ElectronBindings['workspaceRegistry']>('workspaceRegistry'),
  exportService: token<ElectronBindings['exportService']>('exportService'),
  desktopNotificationService: token<ElectronBindings['desktopNotificationService']>(
    'desktopNotificationService',
  ),
  gitService: token<ElectronBindings['gitService']>('gitService'),
  graphLayoutStore: token<ElectronBindings['graphLayoutStore']>('graphLayoutStore'),
  knowledgeEngineService:
    token<ElectronBindings['knowledgeEngineService']>('knowledgeEngineService'),
  terminalService: token<ElectronBindings['terminalService']>('terminalService'),
  webDavProfileStore: token<ElectronBindings['webDavProfileStore']>('webDavProfileStore'),
  webDavSyncStateStore: token<ElectronBindings['webDavSyncStateStore']>('webDavSyncStateStore'),
  workspaceSyncConfigStore: token<ElectronBindings['workspaceSyncConfigStore']>(
    'workspaceSyncConfigStore',
  ),
  workspaceSyncCoordinator: token<ElectronBindings['workspaceSyncCoordinator']>(
    'workspaceSyncCoordinator',
  ),
  workspaceWebDavSyncService: token<ElectronBindings['workspaceWebDavSyncService']>(
    'workspaceWebDavSyncService',
  ),
  lifecycleCoordinator: token<ElectronBindings['lifecycleCoordinator']>('lifecycleCoordinator'),
} as const satisfies {
  [K in keyof ElectronBindings]: ElectronToken<ElectronBindings[K]>
}
