import type { Kysely, Transaction } from 'kysely'

import type { LocalHistoryDatabaseSchema } from '@electron/services/localHistory/database'
import type { LocalHistorySnapshot } from '@electron/services/localHistory/types'

type HistoryDatabase = Kysely<LocalHistoryDatabaseSchema> | Transaction<LocalHistoryDatabaseSchema>

export class HistoryEntryRepository {
  latest(database: HistoryDatabase, documentId: number) {
    return database
      .selectFrom('history_entries')
      .select(['id', 'content_hash', 'created_at_ms'])
      .where('document_id', '=', documentId)
      .orderBy('created_at_ms', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst()
  }

  insert(
    database: HistoryDatabase,
    documentId: number,
    snapshot: LocalHistorySnapshot,
    createdAtMs: number,
  ): Promise<unknown> {
    return database
      .insertInto('history_entries')
      .values({
        content: snapshot.content,
        content_hash: snapshot.content_hash,
        created_at: snapshot.created_at,
        created_at_ms: createdAtMs,
        document_id: documentId,
        id: snapshot.id,
        size_bytes: snapshot.size_bytes,
        source: snapshot.source,
      })
      .execute()
  }

  async remove(database: HistoryDatabase, documentId: number, entryId: string): Promise<boolean> {
    const result = await database
      .deleteFrom('history_entries')
      .where('id', '=', entryId)
      .where('document_id', '=', documentId)
      .executeTakeFirst()
    return Number(result.numDeletedRows) > 0
  }

  async prune(database: HistoryDatabase, documentId: number, limit: number): Promise<void> {
    const stale = await database
      .selectFrom('history_entries')
      .select('id')
      .where('document_id', '=', documentId)
      .orderBy('created_at_ms', 'desc')
      .orderBy('id', 'desc')
      .limit(2_147_483_647)
      .offset(limit)
      .execute()
    if (stale.length === 0) return
    await database
      .deleteFrom('history_entries')
      .where(
        'id',
        'in',
        stale.map(({ id }) => id),
      )
      .execute()
  }

  async count(database: HistoryDatabase, documentId: number): Promise<number> {
    const row = await database
      .selectFrom('history_entries')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .where('document_id', '=', documentId)
      .executeTakeFirstOrThrow()
    return Number(row.count)
  }

  async list(
    database: HistoryDatabase,
    documentId: number,
    filePath: string,
  ): Promise<LocalHistorySnapshot[]> {
    const rows = await entryQuery(database, documentId)
      .orderBy('created_at_ms', 'desc')
      .orderBy('id', 'desc')
      .execute()
    return rows.map((row) => ({ ...row, path: filePath }))
  }

  async get(
    database: HistoryDatabase,
    documentId: number,
    entryId: string,
    filePath: string,
  ): Promise<LocalHistorySnapshot | undefined> {
    const row = await entryQuery(database, documentId).where('id', '=', entryId).executeTakeFirst()
    return row ? { ...row, path: filePath } : undefined
  }
}

const entryQuery = (database: HistoryDatabase, documentId: number) =>
  database
    .selectFrom('history_entries')
    .select(['id', 'created_at', 'size_bytes', 'content_hash', 'source', 'content'])
    .where('document_id', '=', documentId)
