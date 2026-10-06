import type { Insertable } from 'kysely'

import { allCompiledQuery, runCompiledQuery } from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'
import type { SyncConflictsTable } from '@electron/database/types'

const INSERT_BATCH_SIZE = 500
export type SyncConflictWrite = Insertable<SyncConflictsTable>

export class SyncConflictRepository {
  list(database: LocalDatabaseService, workspaceId: number) {
    return allCompiledQuery(
      database.sqlite,
      database.database
        .selectFrom('sync_conflicts')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .orderBy('position'),
    )
  }

  replace(database: LocalDatabaseService, workspaceId: number, rows: SyncConflictWrite[]): void {
    runCompiledQuery(
      database.sqlite,
      database.database.deleteFrom('sync_conflicts').where('workspace_id', '=', workspaceId),
    )
    for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
      runCompiledQuery(
        database.sqlite,
        database.database
          .insertInto('sync_conflicts')
          .values(rows.slice(offset, offset + INSERT_BATCH_SIZE)),
      )
    }
  }
}
