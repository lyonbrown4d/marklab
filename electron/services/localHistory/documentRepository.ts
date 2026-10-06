import type { Kysely, Transaction } from 'kysely'

import type { LocalHistoryDatabaseSchema } from '@electron/services/localHistory/database'
import type { LocalHistoryDocumentIdentity } from '@electron/services/localHistory/store'

type HistoryDatabase = Kysely<LocalHistoryDatabaseSchema> | Transaction<LocalHistoryDatabaseSchema>

export class HistoryDocumentRepository {
  find(database: HistoryDatabase, identity: LocalHistoryDocumentIdentity) {
    return database
      .selectFrom('history_documents')
      .select('id')
      .where('workspace_kind', '=', identity.workspaceKind)
      .where('workspace_path', '=', identity.workspacePath)
      .where('file_path', '=', identity.filePath)
      .executeTakeFirst()
  }

  async findOrCreate(
    database: HistoryDatabase,
    identity: LocalHistoryDocumentIdentity,
  ): Promise<number> {
    await database
      .insertInto('history_documents')
      .values({
        file_path: identity.filePath,
        workspace_kind: identity.workspaceKind,
        workspace_path: identity.workspacePath,
      })
      .onConflict((conflict) =>
        conflict.columns(['workspace_kind', 'workspace_path', 'file_path']).doNothing(),
      )
      .execute()
    const document = await this.find(database, identity)
    if (!document) throw new Error('Local history document could not be created')
    return document.id
  }

  remove(database: HistoryDatabase, documentId: number): Promise<unknown> {
    return database.deleteFrom('history_documents').where('id', '=', documentId).execute()
  }
}
