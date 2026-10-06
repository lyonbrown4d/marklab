import { getCompiledQuery, runCompiledQuery } from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'

export type WindowSessionRow = {
  active_tab_id: string | null
  root_kind: 'external' | 'internal' | 'single'
  root_path: string | null
  version: number
}

export type WindowSessionWrite = WindowSessionRow & { id: string }

export class WindowSessionRepository {
  constructor(private readonly localDatabase: LocalDatabaseService) {}

  get(id: string): WindowSessionRow | undefined {
    return getCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database
        .selectFrom('window_sessions')
        .select(['active_tab_id', 'root_kind', 'root_path', 'version'])
        .where('id', '=', id),
    )
  }

  upsert(value: WindowSessionWrite): void {
    const updatedAt = new Date().toISOString()
    runCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database
        .insertInto('window_sessions')
        .values({ ...value, updated_at: updatedAt, workspace_id: null })
        .onConflict((conflict) =>
          conflict.column('id').doUpdateSet({
            active_tab_id: value.active_tab_id,
            root_kind: value.root_kind,
            root_path: value.root_path,
            updated_at: updatedAt,
            version: value.version,
          }),
        ),
    )
  }

  remove(id: string): void {
    runCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database.deleteFrom('window_sessions').where('id', '=', id),
    )
  }
}
