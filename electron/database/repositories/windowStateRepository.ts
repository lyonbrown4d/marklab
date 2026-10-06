import { getCompiledQuery, runCompiledQuery } from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'
import type { PersistedWindowState } from '@electron/types'

type WindowStateRow = {
  height: number
  is_maximized: 0 | 1
  width: number
  x: number | null
  y: number | null
}

export class WindowStateRepository {
  constructor(private readonly localDatabase: LocalDatabaseService) {}

  get(windowId: string): WindowStateRow | undefined {
    return getCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database
        .selectFrom('window_state')
        .select(['x', 'y', 'width', 'height', 'is_maximized'])
        .where('window_id', '=', windowId),
    )
  }

  upsert(windowId: string, state: PersistedWindowState): void {
    const values = {
      height: state.height,
      is_maximized: state.isMaximized ? (1 as const) : (0 as const),
      updated_at: new Date().toISOString(),
      width: state.width,
      window_id: windowId,
      x: state.x ?? null,
      y: state.y ?? null,
    }
    runCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database
        .insertInto('window_state')
        .values(values)
        .onConflict((conflict) =>
          conflict.column('window_id').doUpdateSet({
            height: values.height,
            is_maximized: values.is_maximized,
            updated_at: values.updated_at,
            width: values.width,
            x: values.x,
            y: values.y,
          }),
        ),
    )
  }
}
