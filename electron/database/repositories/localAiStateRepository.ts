import type Sqlite from 'better-sqlite3'
import type { Kysely, Selectable } from 'kysely'

import { getCompiledQuery, runCompiledQuery } from '@electron/database/compiledQuery'
import { LOCAL_AI_STATE_SINGLETON_ID } from '@electron/database/schema'
import type { DatabaseSchema, LocalAiStateTable } from '@electron/database/types'

type LocalAiStateRow = Selectable<LocalAiStateTable>

export type LocalAiStateRecord = {
  activeModelId: string | null
  migrationJson: string | null
  modelDirectoryDeviceId: string | null
  modelDirectoryEnabled: boolean
  modelDirectoryPath: string | null
  updatedAt: string
}

export type LocalAiDirectoryStateWrite = {
  deviceId?: string
  enabled: boolean
  path?: string
  updatedAt: string
}

export class LocalAiStateRepository {
  constructor(
    private readonly database: Kysely<DatabaseSchema>,
    private readonly sqlite: Sqlite.Database,
  ) {}

  find(): LocalAiStateRecord | undefined {
    const query = this.database
      .selectFrom('local_ai_state')
      .selectAll()
      .where('id', '=', LOCAL_AI_STATE_SINGLETON_ID)
    const row = getCompiledQuery<LocalAiStateRow>(this.sqlite, query)
    return row ? toRecord(row) : undefined
  }

  upsertDirectoryConfig(values: LocalAiDirectoryStateWrite): void {
    const row = {
      id: LOCAL_AI_STATE_SINGLETON_ID,
      model_directory_device_id: values.deviceId ?? null,
      model_directory_enabled: values.enabled ? (1 as const) : (0 as const),
      model_directory_path: values.path ?? null,
      updated_at: values.updatedAt,
    }
    const query = this.database
      .insertInto('local_ai_state')
      .values(row)
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet({
          model_directory_device_id: row.model_directory_device_id,
          model_directory_enabled: row.model_directory_enabled,
          model_directory_path: row.model_directory_path,
          updated_at: row.updated_at,
        }),
      )
    runCompiledQuery(this.sqlite, query)
  }

  upsertMigrationJson(migrationJson: string, updatedAt: string): void {
    const query = this.database
      .insertInto('local_ai_state')
      .values({
        id: LOCAL_AI_STATE_SINGLETON_ID,
        migration_json: migrationJson,
        model_directory_enabled: 0,
        updated_at: updatedAt,
      })
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet({
          migration_json: migrationJson,
          updated_at: updatedAt,
        }),
      )
    runCompiledQuery(this.sqlite, query)
  }
}

const toRecord = (row: LocalAiStateRow): LocalAiStateRecord => ({
  activeModelId: row.active_model_id,
  migrationJson: row.migration_json,
  modelDirectoryDeviceId: row.model_directory_device_id,
  modelDirectoryEnabled: row.model_directory_enabled === 1,
  modelDirectoryPath: row.model_directory_path,
  updatedAt: row.updated_at,
})
