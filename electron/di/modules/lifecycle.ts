import { ContainerModule } from 'inversify'

import { TOKENS } from '@electron/di/tokens'
import { LifecycleCoordinator } from '@electron/main/lifecycle/lifecycleCoordinator'
import { createMainLifecycleTasks } from '@electron/main/lifecycle/mainLifecycleTasks'
import { configureSettingsStore } from '@electron/services/settingsStore'

export const lifecycleModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.lifecycleCoordinator)
    .toResolvedValue(
      (
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
            }),
            ...lifecycleTasks,
          ],
        }),
      [
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
