import type { Insertable } from 'kysely'

import { allCompiledQuery, runCompiledQuery } from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'
import type { WebDavSyncEntriesTable } from '@electron/database/types'

const INSERT_BATCH_SIZE = 500
export type WebDavSyncEntryWrite = Insertable<WebDavSyncEntriesTable>

export class WebDavSyncEntryRepository {
  list(database: LocalDatabaseService, workspaceId: number) {
    return allCompiledQuery(
      database.sqlite,
      database.database
        .selectFrom('webdav_sync_entries')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .orderBy('position'),
    )
  }

  replace(database: LocalDatabaseService, workspaceId: number, rows: WebDavSyncEntryWrite[]): void {
    runCompiledQuery(
      database.sqlite,
      database.database.deleteFrom('webdav_sync_entries').where('workspace_id', '=', workspaceId),
    )
    for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
      runCompiledQuery(
        database.sqlite,
        database.database
          .insertInto('webdav_sync_entries')
          .values(rows.slice(offset, offset + INSERT_BATCH_SIZE)),
      )
    }
  }
}
