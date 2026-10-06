import type { Insertable } from 'kysely'

import { allCompiledQuery, runCompiledQuery } from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'
import type { WorkspaceSyncChannelsTable } from '@electron/database/types'

export type WorkspaceSyncChannelWrite = Insertable<WorkspaceSyncChannelsTable>

const selection = [
  'workspace_id',
  'provider',
  'remote',
  'branch',
  'auto_fetch',
  'profile_id',
  'remote_root',
  'auto_sync',
] as const

export class WorkspaceSyncChannelRepository {
  listForWorkspace(database: LocalDatabaseService, workspaceId: number) {
    return allCompiledQuery(
      database.sqlite,
      database.database
        .selectFrom('workspace_sync_channels')
        .select(selection)
        .where('workspace_id', '=', workspaceId)
        .orderBy('provider'),
    )
  }

  listAll(database: LocalDatabaseService) {
    return allCompiledQuery(
      database.sqlite,
      database.database
        .selectFrom('workspace_sync_channels')
        .select(selection)
        .orderBy('workspace_id')
        .orderBy('provider'),
    )
  }

  upsert(database: LocalDatabaseService, value: WorkspaceSyncChannelWrite): void {
    runCompiledQuery(
      database.sqlite,
      database.database
        .insertInto('workspace_sync_channels')
        .values(value)
        .onConflict((conflict) =>
          conflict.columns(['workspace_id', 'provider']).doUpdateSet({
            auto_fetch: value.auto_fetch,
            auto_sync: value.auto_sync,
            branch: value.branch,
            profile_id: value.profile_id,
            remote: value.remote,
            remote_root: value.remote_root,
          }),
        ),
    )
  }

  remove(
    database: LocalDatabaseService,
    workspaceId: number,
    provider: WorkspaceSyncChannelsTable['provider'],
  ): void {
    runCompiledQuery(
      database.sqlite,
      database.database
        .deleteFrom('workspace_sync_channels')
        .where('workspace_id', '=', workspaceId)
        .where('provider', '=', provider),
    )
  }
}
