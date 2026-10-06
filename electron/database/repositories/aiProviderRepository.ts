import type { Kysely, Selectable } from 'kysely'

import type { AiProvidersTable, DatabaseSchema } from '@electron/database/types'

type AiProviderRow = Selectable<AiProvidersTable>

export type AiProviderRecord = {
  baseUrl: string | null
  createdAt: string
  encryptedApiKey: Buffer | null
  id: string
  kind: AiProviderRow['kind']
  label: string
  model: string
  updatedAt: string
}

export class AiProviderRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  withDatabase(database: Kysely<DatabaseSchema>): AiProviderRepository {
    return new AiProviderRepository(database)
  }

  async list(): Promise<AiProviderRecord[]> {
    const rows = await this.database.selectFrom('ai_providers').selectAll().execute()
    return rows.map(toRecord)
  }

  async findById(id: string): Promise<AiProviderRecord | undefined> {
    const row = await this.database
      .selectFrom('ai_providers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    return row ? toRecord(row) : undefined
  }

  async upsert(record: AiProviderRecord): Promise<void> {
    const values = {
      base_url: record.baseUrl,
      created_at: record.createdAt,
      encrypted_api_key: record.encryptedApiKey,
      id: record.id,
      kind: record.kind,
      label: record.label,
      model: record.model,
      updated_at: record.updatedAt,
    }
    await this.database
      .insertInto('ai_providers')
      .values(values)
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet({
          base_url: values.base_url,
          encrypted_api_key: values.encrypted_api_key,
          kind: values.kind,
          label: values.label,
          model: values.model,
          updated_at: values.updated_at,
        }),
      )
      .execute()
  }

  async deleteById(id: string): Promise<void> {
    await this.database.deleteFrom('ai_providers').where('id', '=', id).execute()
  }

  async updateEncryptedApiKey(
    id: string,
    encryptedApiKey: Buffer | null,
    updatedAt: string,
  ): Promise<void> {
    await this.database
      .updateTable('ai_providers')
      .set({ encrypted_api_key: encryptedApiKey, updated_at: updatedAt })
      .where('id', '=', id)
      .execute()
  }
}

const toRecord = (row: AiProviderRow): AiProviderRecord => ({
  baseUrl: row.base_url,
  createdAt: row.created_at,
  encryptedApiKey: row.encrypted_api_key,
  id: row.id,
  kind: row.kind,
  label: row.label,
  model: row.model,
  updatedAt: row.updated_at,
})
