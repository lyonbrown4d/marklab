import { ContainerModule } from 'inversify'

import { TOKENS } from '@electron/di/tokens'
import { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import { KnowledgeEngineWorkspaceSearchBackend } from '@electron/services/knowledgeEngine/workspaceSearchBackend'
import { removeRendererSession } from '@electron/services/settingsStore'
import { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'
import { WorkspaceGraphComputationScheduler } from '@electron/services/workspace/workspaceGraphComputationScheduler'
import { WorkspaceGraphStore } from '@electron/services/workspace/workspaceGraphStore'
import { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex'
import { WorkspaceAnalysisScheduler } from '@electron/services/workspace/workspaceAnalysisConcurrency'

export const workspaceModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.workspaceAnalysisScheduler).toConstantValue(new WorkspaceAnalysisScheduler())
  bind(TOKENS.knowledgeEngineService)
    .toResolvedValue(
      (app, logger, scheduler) =>
        new KnowledgeEngineService({
          app,
          logger: logger.child('knowledge-engine'),
          workspaceAnalysisScheduler: scheduler,
        }),
      [TOKENS.app, TOKENS.logger, TOKENS.workspaceAnalysisScheduler],
    )
    .inSingletonScope()
  bind(TOKENS.workspaceSearchIndexFactory)
    .toResolvedValue(
      (knowledgeEngineService) => () =>
        new WorkspaceSearchIndex(new KnowledgeEngineWorkspaceSearchBackend(knowledgeEngineService)),
      [TOKENS.knowledgeEngineService],
    )
    .inSingletonScope()
  bind(TOKENS.workspaceGraphScheduler)
    .toResolvedValue(
      (scheduler) => new WorkspaceGraphComputationScheduler({ scheduler }),
      [TOKENS.workspaceAnalysisScheduler],
    )
    .inSingletonScope()
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
        analysisScheduler,
      ) =>
        new WindowWorkspaceRegistry(app, shell, logger.child('workspace'), {
          knowledgeEngineService,
          localHistoryService,
          onSessionDisposed: removeRendererSession,
          workspaceGraphScheduler: graphScheduler,
          workspaceGraphStore: graphStore,
          workspaceSearchIndexFactory: indexFactory,
          workspaceAnalysisScheduler: analysisScheduler,
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
        TOKENS.workspaceAnalysisScheduler,
      ],
    )
    .inSingletonScope()
})
