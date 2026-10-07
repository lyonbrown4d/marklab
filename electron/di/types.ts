import type * as Electron from 'electron'

import type { LocalDatabaseService } from '@electron/database/service'
import type { LifecycleCoordinator } from '@electron/main/lifecycle/lifecycleCoordinator'
import type { LifecycleTask } from '@electron/main/lifecycle/types'
import type { AiService } from '@electron/services/ai/aiService'
import type { AiInlineCompletionPolicy } from '@electron/services/ai/completion/policy'
import type { AiInlineCompletionService } from '@electron/services/ai/completion/service'
import type { AiProviderStore } from '@electron/services/ai/providerStore'
import type { VercelAiProviderResolver } from '@electron/services/ai/providerResolver'
import type { ExportService } from '@electron/services/export/exportService'
import type { GitService } from '@electron/services/git/service'
import type { GraphLayoutStore } from '@electron/services/graphLayout/graphLayoutStore'
import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LanguageIntelligenceService } from '@electron/services/languageIntelligence/service'
import type { LinkPreviewService } from '@electron/services/linkPreview/service'
import type { LocalHistoryService } from '@electron/services/localHistory/service'
import type { Logger } from '@electron/services/logger'
import type { SettingsStore } from '@electron/services/settingsStore'
import type { WorkspaceSyncCoordinator } from '@electron/services/sync/core/coordinator'
import type { WebDavProfileStore } from '@electron/services/sync/webdav/profileStore'
import type { FileLocalSyncStateStore } from '@electron/services/sync/webdavSync/stateStore'
import type { WorkspaceSyncConfigStore } from '@electron/services/sync/workspaceSyncConfig'
import type { WorkspaceWebDavSyncService } from '@electron/services/sync/workspaceWebDavSyncService'
import type { TerminalService } from '@electron/services/terminal/service'
import type { WebTabManager } from '@electron/services/webTabs/webTabManager'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'
import type { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex'
import type { WorkspaceGraphComputationScheduler } from '@electron/services/workspace/workspaceGraphComputationScheduler'
import type { WorkspaceGraphStore } from '@electron/services/workspace/workspaceGraphStore'

export type WorkspaceSearchIndexFactory = () => WorkspaceSearchIndex

export type ElectronBindings = {
  app: Electron.App
  BrowserWindow: typeof Electron.BrowserWindow
  WebContentsView: typeof Electron.WebContentsView
  safeStorage: Electron.SafeStorage
  shell: Electron.Shell
  lifecycleTasks: readonly LifecycleTask[]
  logger: Logger
  localDatabaseService: LocalDatabaseService
  settingsStore: SettingsStore
  aiProviderStore: AiProviderStore
  aiModelResolver: VercelAiProviderResolver
  aiService: AiService
  aiInlineCompletionPolicy: AiInlineCompletionPolicy
  aiInlineCompletionService: AiInlineCompletionService
  localHistoryService: LocalHistoryService
  languageIntelligenceService: LanguageIntelligenceService
  linkPreviewService: LinkPreviewService
  webTabManager: WebTabManager
  workspaceSearchIndexFactory: WorkspaceSearchIndexFactory
  workspaceGraphScheduler: WorkspaceGraphComputationScheduler
  workspaceGraphStore: WorkspaceGraphStore
  workspaceRegistry: WindowWorkspaceRegistry
  exportService: ExportService
  gitService: GitService
  graphLayoutStore: GraphLayoutStore
  knowledgeEngineService: KnowledgeEngineService
  terminalService: TerminalService
  webDavProfileStore: WebDavProfileStore
  webDavSyncStateStore: FileLocalSyncStateStore
  workspaceSyncConfigStore: WorkspaceSyncConfigStore
  workspaceSyncCoordinator: WorkspaceSyncCoordinator
  workspaceWebDavSyncService: WorkspaceWebDavSyncService
  lifecycleCoordinator: LifecycleCoordinator
}

export type ElectronRuntimeDependencies = Pick<
  ElectronBindings,
  'app' | 'BrowserWindow' | 'WebContentsView' | 'safeStorage' | 'shell'
> & {
  lifecycleTasks?: readonly LifecycleTask[]
}

export type ElectronServices = Pick<
  ElectronBindings,
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

export type ElectronRuntime = {
  readonly services: ElectronServices
  shutdown: () => Promise<void>
  startup: () => Promise<void>
}
