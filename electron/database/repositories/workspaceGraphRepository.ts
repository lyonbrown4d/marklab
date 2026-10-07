import type { Selectable } from 'kysely'

import { getCompiledQuery, runCompiledQuery } from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'
import type { WorkspaceGraphsTable } from '@electron/database/types'

export type WorkspaceGraphRow = Selectable<WorkspaceGraphsTable>
export type WorkspaceGraphWrite = Omit<WorkspaceGraphRow, 'updated_at'>

export class WorkspaceGraphRepository {
  get(database: LocalDatabaseService, workspaceKey: string): WorkspaceGraphRow | undefined {
    return getCompiledQuery(
      database.sqlite,
      database.database
        .selectFrom('workspace_graphs')
        .selectAll()
        .where('workspace_key', '=', workspaceKey),
    )
  }

  upsert(database: LocalDatabaseService, value: WorkspaceGraphWrite): void {
    const updatedAt = new Date().toISOString()
    runCompiledQuery(
      database.sqlite,
      database.database
        .insertInto('workspace_graphs')
        .values({ ...value, updated_at: updatedAt })
        .onConflict((conflict) =>
          conflict.column('workspace_key').doUpdateSet({
            graph_json: value.graph_json,
            graph_revision: value.graph_revision,
            updated_at: updatedAt,
          }),
        ),
    )
  }
}
