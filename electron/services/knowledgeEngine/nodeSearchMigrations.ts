import type { Kysely } from 'kysely'
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration'

import type { NodeSearchDatabaseSchema } from '@electron/services/knowledgeEngine/nodeSearchDatabaseTypes'
import {
  createSearchDocumentDeleteTrigger,
  createSearchDocumentInsertTrigger,
  createSearchDocumentUpdateTrigger,
  createSearchFtsTable,
  dropSearchDocumentDeleteTrigger,
  dropSearchDocumentInsertTrigger,
  dropSearchDocumentUpdateTrigger,
  dropSearchFtsTable,
} from '@electron/services/knowledgeEngine/nodeSearchFtsSql'

const initialSearchMigration: Migration = {
  up: async (database: Kysely<unknown>) => {
    await database.schema
      .createTable('search_metadata')
      .addColumn('key', 'text', (column) => column.primaryKey())
      .addColumn('value', 'text', (column) => column.notNull())
      .execute()
    await database.schema
      .createTable('search_documents')
      .addColumn('id', 'integer', (column) => column.primaryKey().autoIncrement())
      .addColumn('path', 'text', (column) => column.notNull().unique())
      .addColumn('title', 'text', (column) => column.notNull())
      .addColumn('content', 'text', (column) => column.notNull())
      .addColumn('folded_path', 'text', (column) => column.notNull())
      .addColumn('folded_title', 'text', (column) => column.notNull())
      .addColumn('folded_content', 'text', (column) => column.notNull())
      .execute()
    await createSearchFtsTable.execute(database)
    await createSearchDocumentInsertTrigger.execute(database)
    await createSearchDocumentDeleteTrigger.execute(database)
    await createSearchDocumentUpdateTrigger.execute(database)
  },
  down: async (database: Kysely<unknown>) => {
    await dropSearchDocumentUpdateTrigger.execute(database)
    await dropSearchDocumentDeleteTrigger.execute(database)
    await dropSearchDocumentInsertTrigger.execute(database)
    await dropSearchFtsTable.execute(database)
    await database.schema.dropTable('search_documents').execute()
    await database.schema.dropTable('search_metadata').execute()
  },
}

export const nodeSearchMigrationProvider: MigrationProvider = {
  getMigrations: async (): Promise<Record<string, Migration>> => ({
    '001_create_search_index': initialSearchMigration,
  }),
}

export const migrateNodeSearchDatabase = async (
  database: Kysely<NodeSearchDatabaseSchema>,
): Promise<void> => {
  const result = await new Migrator({
    db: database,
    provider: nodeSearchMigrationProvider,
  }).migrateToLatest()
  if (result.error) {
    throw new Error('Node search database migration failed', { cause: result.error })
  }
}
