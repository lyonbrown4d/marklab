import { getCompiledQuery, runCompiledQuery } from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'

export type SettingRow = { value_json: string; version: number | null }

export class SettingsRepository {
  constructor(private readonly localDatabase: LocalDatabaseService) {}

  get(key: string): SettingRow | undefined {
    return getCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database
        .selectFrom('settings')
        .select(['value_json', 'version'])
        .where('key', '=', key),
    )
  }

  upsert(key: string, valueJson: string, version: number | null): void {
    const updatedAt = new Date().toISOString()
    runCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database
        .insertInto('settings')
        .values({ key, updated_at: updatedAt, value_json: valueJson, version })
        .onConflict((conflict) =>
          conflict.column('key').doUpdateSet({
            updated_at: updatedAt,
            value_json: valueJson,
            version,
          }),
        ),
    )
  }

  remove(key: string): void {
    runCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database.deleteFrom('settings').where('key', '=', key),
    )
  }
}
