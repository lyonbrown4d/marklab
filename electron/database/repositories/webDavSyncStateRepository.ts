import type { Insertable } from 'kysely'

import { getCompiledQuery, runCompiledQuery } from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'
import type { WebDavSyncStateTable } from '@electron/database/types'

export type WebDavSyncStateWrite = Insertable<WebDavSyncStateTable>

const selection = [
  'workspace_id',
  'remote_manifest_etag',
  'updated_at',
  'has_unresolved_conflicts',
] as const

export class WebDavSyncStateRepository {
  get(database: LocalDatabaseService, workspaceId: number) {
    return getCompiledQuery(
      database.sqlite,
      database.database
        .selectFrom('webdav_sync_state')
        .select(selection)
        .where('workspace_id', '=', workspaceId),
    )
  }

  upsert(database: LocalDatabaseService, value: WebDavSyncStateWrite): void {
    runCompiledQuery(
      database.sqlite,
      database.database
        .insertInto('webdav_sync_state')
        .values(value)
        .onConflict((conflict) =>
          conflict.column('workspace_id').doUpdateSet({
            has_unresolved_conflicts: value.has_unresolved_conflicts,
            remote_manifest_etag: value.remote_manifest_etag,
            updated_at: value.updated_at,
          }),
        ),
    )
  }
}
