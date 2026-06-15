import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as searchIndexSchema from '@electron/services/workspace/workspaceSearchIndexSchema.js'

export type SqliteDatabase = ReturnType<typeof Database>

const resolveSearchMigrationsFolder = (): string => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(currentDir, 'workspaceSearchIndexMigrations'),
    path.join(process.cwd(), 'dist-electron', 'workspaceSearchIndexMigrations'),
    path.join(process.cwd(), 'electron', 'services', 'workspace', 'workspaceSearchIndexMigrations'),
  ]
  return candidates.find(existsSync) ?? candidates[0]
}

export const openSearchDatabase = (databasePath: string): SqliteDatabase => {
  const database = new Database(databasePath)
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = NORMAL')
  database.pragma('foreign_keys = ON')
  return database
}

export const ensureSearchSchema = async (database: SqliteDatabase): Promise<void> => {
  const migrationsFolder = resolveSearchMigrationsFolder()
  const orm = drizzle(database, { schema: searchIndexSchema })
  await migrate(orm, { migrationsFolder })
}

export const runSqliteTransaction = <T>(database: SqliteDatabase, action: () => T): T => {
  database.pragma('foreign_keys = ON')
  database.prepare('BEGIN IMMEDIATE').run()
  try {
    const result = action()
    database.prepare('COMMIT').run()
    return result
  } catch (error) {
    database.prepare('ROLLBACK').run()
    throw error
  }
}
