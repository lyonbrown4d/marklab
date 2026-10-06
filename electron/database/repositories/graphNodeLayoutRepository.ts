import type { Insertable, Selectable } from 'kysely'

import { allCompiledQuery, runCompiledQuery } from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'
import type { GraphNodeLayoutsTable } from '@electron/database/types'

const INSERT_BATCH_SIZE = 100

export type GraphNodeLayoutRow = Selectable<GraphNodeLayoutsTable>
export type GraphNodeLayoutWrite = Insertable<GraphNodeLayoutsTable>

export class GraphNodeLayoutRepository {
  list(
    database: LocalDatabaseService,
    workspaceKey: string,
    layoutKey: string,
  ): GraphNodeLayoutRow[] {
    return allCompiledQuery(
      database.sqlite,
      database.database
        .selectFrom('graph_node_layouts')
        .selectAll()
        .where('workspace_key', '=', workspaceKey)
        .where('layout_key', '=', layoutKey)
        .orderBy('node_id'),
    )
  }

  replace(
    database: LocalDatabaseService,
    workspaceKey: string,
    layoutKey: string,
    rows: GraphNodeLayoutWrite[],
  ): void {
    runCompiledQuery(
      database.sqlite,
      database.database
        .deleteFrom('graph_node_layouts')
        .where('workspace_key', '=', workspaceKey)
        .where('layout_key', '=', layoutKey),
    )
    for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
      runCompiledQuery(
        database.sqlite,
        database.database
          .insertInto('graph_node_layouts')
          .values(rows.slice(offset, offset + INSERT_BATCH_SIZE)),
      )
    }
  }
}
