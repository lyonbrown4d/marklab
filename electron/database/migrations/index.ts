import type { Migration, MigrationProvider } from 'kysely/migration'

import { initialMigration } from '@electron/database/migrations/001_initial'

const staticMigrations: Record<string, Migration> = Object.freeze({
  '001_initial': initialMigration,
})

export const migrations: MigrationProvider = {
  async getMigrations() {
    return staticMigrations
  },
}
