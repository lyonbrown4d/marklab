import type { Kysely } from 'kysely'
import type { Migration } from 'kysely/migration'

import { createCoreTables, dropCoreTables } from '@electron/database/migrations/001_initial_core'
import {
  createIntegrationTables,
  dropIntegrationTables,
} from '@electron/database/migrations/001_initial_integrations'

export const initialMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await createCoreTables(db)
    await createIntegrationTables(db)
  },
  async down(db: Kysely<unknown>) {
    await dropIntegrationTables(db)
    await dropCoreTables(db)
  },
}
