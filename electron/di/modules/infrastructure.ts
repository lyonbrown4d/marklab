import { ContainerModule } from 'inversify'

import { LocalDatabaseService } from '@electron/database/service'
import { TOKENS } from '@electron/di/tokens'
import type { ElectronRuntimeDependencies } from '@electron/di/types'
import { LocalHistoryService } from '@electron/services/localHistory/service'
import type { Logger } from '@electron/services/logger'
import { SettingsStore } from '@electron/services/settingsStore'

export const createInfrastructureModule = (
  dependencies: ElectronRuntimeDependencies,
  logger: Logger,
): ContainerModule =>
  new ContainerModule(({ bind }) => {
    bind(TOKENS.app).toConstantValue(dependencies.app)
    bind(TOKENS.BrowserWindow).toConstantValue(dependencies.BrowserWindow)
    bind(TOKENS.WebContentsView).toConstantValue(dependencies.WebContentsView)
    bind(TOKENS.safeStorage).toConstantValue(dependencies.safeStorage)
    bind(TOKENS.shell).toConstantValue(dependencies.shell)
    bind(TOKENS.lifecycleTasks).toConstantValue(dependencies.lifecycleTasks ?? [])
    bind(TOKENS.logger).toConstantValue(logger)

    bind(TOKENS.localDatabaseService)
      .toResolvedValue(
        (app) => new LocalDatabaseService({ userDataPath: app.getPath('userData') }),
        [TOKENS.app],
      )
      .inSingletonScope()
    bind(TOKENS.settingsStore)
      .toResolvedValue((database) => new SettingsStore(database), [TOKENS.localDatabaseService])
      .inSingletonScope()
    bind(TOKENS.localHistoryService)
      .toResolvedValue(
        (app) => new LocalHistoryService({ userDataPath: app.getPath('userData') }),
        [TOKENS.app],
      )
      .inSingletonScope()
  })
