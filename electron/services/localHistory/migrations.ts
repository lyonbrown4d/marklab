import type { Kysely } from 'kysely'
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration'

import type { LocalHistoryDatabaseSchema } from '@electron/services/localHistory/database'

const initialMigration: Migration = {
  up: async (database: Kysely<unknown>) => {
    await database.schema
      .createTable('history_documents')
      .addColumn('id', 'integer', (column) => column.primaryKey().autoIncrement())
      .addColumn('workspace_kind', 'text', (column) => column.notNull())
      .addColumn('workspace_path', 'text', (column) => column.notNull())
      .addColumn('file_path', 'text', (column) => column.notNull())
      .execute()
    await database.schema
      .createIndex('history_documents_identity_unique')
      .unique()
      .on('history_documents')
      .columns(['workspace_kind', 'workspace_path', 'file_path'])
      .execute()
    await database.schema
      .createTable('history_entries')
      .addColumn('id', 'text', (column) => column.primaryKey())
      .addColumn('document_id', 'integer', (column) =>
        column.notNull().references('history_documents.id').onDelete('cascade'),
      )
      .addColumn('created_at', 'text', (column) => column.notNull())
      .addColumn('created_at_ms', 'integer', (column) => column.notNull())
      .addColumn('size_bytes', 'integer', (column) => column.notNull())
      .addColumn('content_hash', 'text', (column) => column.notNull())
      .addColumn('source', 'text', (column) => column.notNull())
      .addColumn('content', 'text', (column) => column.notNull())
      .execute()
    await database.schema
      .createIndex('history_entries_document_created')
      .on('history_entries')
      .columns(['document_id', 'created_at_ms', 'id'])
      .execute()
  },
  down: async (database: Kysely<unknown>) => {
    await database.schema.dropTable('history_entries').ifExists().execute()
    await database.schema.dropTable('history_documents').ifExists().execute()
  },
}

export const localHistoryMigrationProvider: MigrationProvider = {
  getMigrations: async (): Promise<Record<string, Migration>> => ({
    '001_create_local_history': initialMigration,
  }),
}

export const migrateLocalHistoryDatabase = async (
  database: Kysely<LocalHistoryDatabaseSchema>,
): Promise<void> => {
  const result = await new Migrator({
    db: database,
    provider: localHistoryMigrationProvider,
  }).migrateToLatest()
  if (result.error) {
    throw new Error('Local history database migration failed', { cause: result.error })
  }
}
