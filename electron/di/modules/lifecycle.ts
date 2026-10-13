import { ContainerModule } from 'inversify'

import { TOKENS } from '@electron/di/tokens'
import { LifecycleCoordinator } from '@electron/main/lifecycle/lifecycleCoordinator'
import { createMainLifecycleTasks } from '@electron/main/lifecycle/mainLifecycleTasks'
import { configureSettingsStore } from '@electron/services/settingsStore'
import { RENDERER_PERSIST_KEYS } from '@/types/persistenceKeys'
import {
  initializeWorkspaceUserGuide,
  workspaceUserGuideAssetsPath,
  workspaceUserGuideLocale,
} from '@electron/services/workspace/workspaceUserGuide'

export const lifecycleModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.lifecycleCoordinator)
    .toResolvedValue(
      (
        app,
        logger,
        lifecycleTasks,
        localDatabaseService,
        settingsStore,
        knowledgeEngineService,
        linkPreviewService,
        localHistoryService,
        workspaceRegistry,
      ) =>
        new LifecycleCoordinator({
          logger,
          tasks: [
            ...createMainLifecycleTasks({
              configureSettingsStore,
              getKnowledgeEngineService: () => knowledgeEngineService,
              getLinkPreviewService: () => linkPreviewService,
              getLocalHistoryService: () => localHistoryService,
              getSettingsStore: () => settingsStore,
              getWorkspaceRegistry: () => workspaceRegistry,
              localDatabaseService,
              prepareWorkspaceUserGuide: () =>
                initializeWorkspaceUserGuide({
                  assetsPath: workspaceUserGuideAssetsPath({
                    appPath: app.getAppPath(),
                    isPackaged: app.isPackaged,
                    resourcesPath: process.resourcesPath,
                  }),
                  userDataPath: app.getPath('userData'),
                  locale: workspaceUserGuideLocale(
                    settingsStore.getRendererPersistValue(RENDERER_PERSIST_KEYS.preferences),
                    app.getLocale(),
                  ),
                }),
            }),
            ...lifecycleTasks,
          ],
        }),
      [
        TOKENS.app,
        TOKENS.logger,
        TOKENS.lifecycleTasks,
        TOKENS.localDatabaseService,
        TOKENS.settingsStore,
        TOKENS.knowledgeEngineService,
        TOKENS.linkPreviewService,
        TOKENS.localHistoryService,
        TOKENS.workspaceRegistry,
      ],
    )
    .inSingletonScope()
})
