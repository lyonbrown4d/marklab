import { allCompiledQuery, runCompiledQuery } from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'
import type { Insertable } from 'kysely'

import type { SessionTabsTable } from '@electron/database/types'

export type SessionTabWrite = Insertable<SessionTabsTable>

export class SessionTabRepository {
  constructor(private readonly localDatabase: LocalDatabaseService) {}

  listStateJson(sessionId: string): Array<{ state_json: string }> {
    return allCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database
        .selectFrom('session_tabs')
        .select('state_json')
        .where('session_id', '=', sessionId)
        .orderBy('position'),
    )
  }

  replace(sessionId: string, rows: SessionTabWrite[]): void {
    runCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database.deleteFrom('session_tabs').where('session_id', '=', sessionId),
    )
    if (rows.length === 0) return
    runCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database.insertInto('session_tabs').values(rows),
    )
  }
}
