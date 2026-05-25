import { runSqliteTransaction } from '@electron/services/workspace/workspaceSearchIndexDatabase.js'
import type { SqliteDatabase } from '@electron/services/workspace/workspaceSearchIndexDatabase.js'

export type SearchSchemaDatabase = {
  prepare(statement: string): {
    run: () => unknown
    get: () => { user_version?: number } | undefined
  }
  exec(statement: string): void
}

export const ensureSearchSchema = (database: SearchSchemaDatabase & SqliteDatabase): void => {
  const currentVersion = Number(database.prepare('PRAGMA user_version').get()?.user_version ?? 0)
  if (currentVersion === SQL_SCHEMA_VERSION) return

  runSqliteTransaction(database, () => {
    database
      .prepare(
        `
          CREATE TABLE IF NOT EXISTS search_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            updated_ms INTEGER NOT NULL,
            size_bytes INTEGER NOT NULL,
            indexed_at INTEGER NOT NULL
          )
        `,
      )
      .run()
    database
      .prepare('CREATE INDEX IF NOT EXISTS search_documents_path_idx ON search_documents(path)')
      .run()
    database
      .prepare(
        `
          CREATE TABLE IF NOT EXISTS search_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            path TEXT NOT NULL,
            title TEXT NOT NULL,
            line_no INTEGER NOT NULL,
            line_text TEXT NOT NULL,
            UNIQUE (document_id, line_no),
            FOREIGN KEY (document_id) REFERENCES search_documents(id) ON DELETE CASCADE
          )
        `,
      )
      .run()
    database
      .prepare('CREATE INDEX IF NOT EXISTS search_lines_document_idx ON search_lines(document_id)')
      .run()
    database
      .prepare(
        `
          CREATE VIRTUAL TABLE IF NOT EXISTS search_lines_fts USING fts5(
            path,
            title,
            body,
            document_id UNINDEXED,
            line_no UNINDEXED,
            content='',
            tokenize='unicode61'
          )
        `,
      )
      .run()
    database
      .prepare(
        `
          CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts USING fts5(
            path,
            title,
            body,
            document_id UNINDEXED,
            content='',
            tokenize='unicode61'
          )
        `,
      )
      .run()
    database.exec(`PRAGMA user_version = ${SQL_SCHEMA_VERSION}`)
  })
}

export const SQL_SCHEMA_VERSION = 2
