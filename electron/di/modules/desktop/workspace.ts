import { ContainerModule } from 'inversify'

import { TOKENS } from '@electron/di/tokens'
import { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import { KnowledgeEngineWorkspaceSearchBackend } from '@electron/services/knowledgeEngine/workspaceSearchBackend'
import { removeRendererSession } from '@electron/services/settingsStore'
import { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'
import { WorkspaceGraphComputationScheduler } from '@electron/services/workspace/workspaceGraphComputationScheduler'
import { WorkspaceGraphStore } from '@electron/services/workspace/workspaceGraphStore'
import { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex'

export const workspaceModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.knowledgeEngineService)
    .toResolvedValue(
      (app, logger) =>
        new KnowledgeEngineService({ app, logger: logger.child('knowledge-engine') }),
      [TOKENS.app, TOKENS.logger],
    )
    .inSingletonScope()
  bind(TOKENS.workspaceSearchIndexFactory)
    .toResolvedValue(
      (knowledgeEngineService) => () =>
        new WorkspaceSearchIndex(new KnowledgeEngineWorkspaceSearchBackend(knowledgeEngineService)),
      [TOKENS.knowledgeEngineService],
    )
    .inSingletonScope()
  bind(TOKENS.workspaceGraphScheduler).toConstantValue(
    new WorkspaceGraphComputationScheduler({ concurrency: 3 }),
  )
  bind(TOKENS.workspaceGraphStore)
    .toResolvedValue((database) => new WorkspaceGraphStore(database), [TOKENS.localDatabaseService])
    .inSingletonScope()
  bind(TOKENS.workspaceRegistry)
    .toResolvedValue(
      (
        app,
        knowledgeEngineService,
        localHistoryService,
        logger,
        shell,
        graphScheduler,
        graphStore,
        indexFactory,
      ) =>
        new WindowWorkspaceRegistry(app, shell, logger.child('workspace'), {
          knowledgeEngineService,
          localHistoryService,
          onSessionDisposed: removeRendererSession,
          workspaceGraphScheduler: graphScheduler,
          workspaceGraphStore: graphStore,
          workspaceSearchIndexFactory: indexFactory,
        }),
      [
        TOKENS.app,
        TOKENS.knowledgeEngineService,
        TOKENS.localHistoryService,
        TOKENS.logger,
        TOKENS.shell,
        TOKENS.workspaceGraphScheduler,
        TOKENS.workspaceGraphStore,
        TOKENS.workspaceSearchIndexFactory,
      ],
    )
    .inSingletonScope()
})
