import fs from 'node:fs'
import path from 'node:path'

import SqliteDatabase from 'better-sqlite3'
import { Kysely, SqliteDialect, type Generated } from 'kysely'

import { configureSqlitePragmas } from '@electron/database/sqlitePragmas'
import { migrateLocalHistoryDatabase } from '@electron/services/localHistory/migrations'
import type { FsRootKind } from '@electron/services/workspace/types'

type HistoryDocumentsTable = {
  id: Generated<number>
  workspace_kind: FsRootKind
  workspace_path: string
  file_path: string
}

type HistoryEntriesTable = {
  id: string
  document_id: number
  created_at: string
  created_at_ms: number
  size_bytes: number
  content_hash: string
  source: 'save'
  content: string
}

export type LocalHistoryDatabaseSchema = {
  history_documents: HistoryDocumentsTable
  history_entries: HistoryEntriesTable
}

export type LocalHistoryDatabase = {
  connection: Kysely<LocalHistoryDatabaseSchema>
  dispose: () => Promise<void>
  ready: Promise<void>
}

export const openLocalHistoryDatabase = (userDataPath: string): LocalHistoryDatabase => {
  const databasePath = path.join(path.resolve(userDataPath), 'storage', 'history.sqlite3')
  const directory = path.dirname(databasePath)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') fs.chmodSync(directory, 0o700)
  const nativeDatabase = new SqliteDatabase(databasePath)
  if (process.platform !== 'win32') fs.chmodSync(databasePath, 0o600)
  configureSqlitePragmas(nativeDatabase, {
    busyTimeoutMs: 3_000,
    foreignKeys: true,
    journalMode: 'wal',
    synchronous: 'normal',
  })

  const connection = new Kysely<LocalHistoryDatabaseSchema>({
    dialect: new SqliteDialect({ database: nativeDatabase }),
  })
  let destroyed = false
  const destroy = async () => {
    if (destroyed) return
    destroyed = true
    await connection.destroy()
  }
  const ready = migrateLocalHistoryDatabase(connection).catch(async (error: unknown) => {
    await destroy()
    throw error
  })
  return {
    connection,
    dispose: async () => {
      await ready.catch(() => undefined)
      await destroy()
    },
    ready,
  }
}
