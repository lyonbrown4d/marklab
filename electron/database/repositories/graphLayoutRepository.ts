import type { Selectable } from 'kysely'

import { getCompiledQuery, runCompiledQuery } from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'
import type { GraphLayoutsTable } from '@electron/database/types'

export type GraphLayoutRow = Selectable<GraphLayoutsTable>
export type GraphLayoutWrite = Omit<GraphLayoutRow, 'updated_at'>

export class GraphLayoutRepository {
  get(
    database: LocalDatabaseService,
    workspaceKey: string,
    layoutKey: string,
  ): GraphLayoutRow | undefined {
    return getCompiledQuery(
      database.sqlite,
      database.database
        .selectFrom('graph_layouts')
        .selectAll()
        .where('workspace_key', '=', workspaceKey)
        .where('layout_key', '=', layoutKey),
    )
  }

  upsert(database: LocalDatabaseService, value: GraphLayoutWrite): void {
    const updatedAt = new Date().toISOString()
    runCompiledQuery(
      database.sqlite,
      database.database
        .insertInto('graph_layouts')
        .values({ ...value, updated_at: updatedAt })
        .onConflict((conflict) =>
          conflict.columns(['workspace_key', 'layout_key']).doUpdateSet({
            engine_version: value.engine_version,
            graph_revision: value.graph_revision,
            mode: value.mode,
            updated_at: updatedAt,
            viewport_x: value.viewport_x,
            viewport_y: value.viewport_y,
            viewport_zoom: value.viewport_zoom,
          }),
        ),
    )
  }
}
