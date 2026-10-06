import { ContainerModule } from 'inversify'

import { TOKENS } from '@electron/di/tokens'
import { WorkspaceSyncCoordinator } from '@electron/services/sync/core/coordinator'
import { WebDavProfileStore } from '@electron/services/sync/webdav/profileStore'
import { FileLocalSyncStateStore } from '@electron/services/sync/webdavSync/stateStore'
import { WorkspaceSyncConfigStore } from '@electron/services/sync/workspaceSyncConfig'
import { WorkspaceWebDavSyncService } from '@electron/services/sync/workspaceWebDavSyncService'

export const syncModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.webDavProfileStore)
    .toResolvedValue(
      (database, safeStorage) => new WebDavProfileStore(database, safeStorage),
      [TOKENS.localDatabaseService, TOKENS.safeStorage],
    )
    .inSingletonScope()
  bind(TOKENS.webDavSyncStateStore)
    .toResolvedValue(
      (database) => new FileLocalSyncStateStore(database),
      [TOKENS.localDatabaseService],
    )
    .inSingletonScope()
  bind(TOKENS.workspaceSyncConfigStore)
    .toResolvedValue(
      (database) => new WorkspaceSyncConfigStore(database),
      [TOKENS.localDatabaseService],
    )
    .inSingletonScope()
  bind(TOKENS.workspaceSyncCoordinator)
    .toResolvedValue(() => new WorkspaceSyncCoordinator(), [])
    .inSingletonScope()
  bind(TOKENS.workspaceWebDavSyncService)
    .toResolvedValue(
      (profileStore, stateStore, configStore, coordinator) =>
        new WorkspaceWebDavSyncService({
          configStore,
          coordinator,
          profileStore,
          stateStore,
        }),
      [
        TOKENS.webDavProfileStore,
        TOKENS.webDavSyncStateStore,
        TOKENS.workspaceSyncConfigStore,
        TOKENS.workspaceSyncCoordinator,
      ],
    )
    .inSingletonScope()
})
