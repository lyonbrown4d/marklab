import { sql, type Insertable } from 'kysely'

import {
  allCompiledQuery,
  getCompiledQuery,
  runCompiledQuery,
} from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'
import type { WorkspaceSyncChannelsTable } from '@electron/database/types'

export type WorkspaceSyncChannelWrite = Insertable<WorkspaceSyncChannelsTable>

const selection = ['workspace_id', 'profile_id', 'remote_root', 'auto_sync'] as const

export class WorkspaceSyncChannelRepository {
  findForWorkspace(database: LocalDatabaseService, workspaceId: number) {
    return getCompiledQuery(
      database.sqlite,
      database.database
        .selectFrom('workspace_sync_channels')
        .select(selection)
        .where('workspace_id', '=', workspaceId),
    )
  }

  listAll(database: LocalDatabaseService) {
    return allCompiledQuery(
      database.sqlite,
      database.database
        .selectFrom('workspace_sync_channels')
        .select(selection)
        .orderBy('workspace_id'),
    )
  }

  upsert(database: LocalDatabaseService, value: WorkspaceSyncChannelWrite): void {
    runCompiledQuery(
      database.sqlite,
      database.database
        .insertInto('workspace_sync_channels')
        .values(value)
        .onConflict((conflict) =>
          conflict.column('workspace_id').doUpdateSet({
            auto_sync: value.auto_sync,
            profile_id: value.profile_id,
            remote_root: value.remote_root,
            updated_at: sql`CURRENT_TIMESTAMP`,
          }),
        ),
    )
  }

  remove(database: LocalDatabaseService, workspaceId: number): void {
    runCompiledQuery(
      database.sqlite,
      database.database
        .deleteFrom('workspace_sync_channels')
        .where('workspace_id', '=', workspaceId),
    )
  }
}
