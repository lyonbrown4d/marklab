import { DatabaseSync } from 'node:sqlite'

export type SqliteDatabase = DatabaseSync

export const openSearchDatabase = (databasePath: string): SqliteDatabase => {
  const database = new DatabaseSync(databasePath, {
    allowBareNamedParameters: true,
    enableForeignKeyConstraints: true,
  })
  database.exec('PRAGMA journal_mode = WAL')
  database.exec('PRAGMA synchronous = NORMAL')
  database.exec('PRAGMA foreign_keys = ON')
  return database
}

export const runSqliteTransaction = <T>(database: SqliteDatabase, action: () => T): T => {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = action()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
