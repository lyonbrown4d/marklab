import { ContainerModule } from 'inversify'

import { TOKENS } from '@electron/di/tokens'
import { GitService } from '@electron/services/git/service'
import { GraphLayoutStore } from '@electron/services/graphLayout/graphLayoutStore'

export const scmGraphModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.gitService)
    .toResolvedValue((logger) => new GitService(logger.child('git')), [TOKENS.logger])
    .inSingletonScope()
  bind(TOKENS.graphLayoutStore)
    .toResolvedValue((database) => new GraphLayoutStore(database), [TOKENS.localDatabaseService])
    .inSingletonScope()
})
