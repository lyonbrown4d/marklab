import type { Insertable, Selectable } from 'kysely'

import type {
  NodeSearchConnection,
  SearchDocumentsTable,
} from '@electron/services/knowledgeEngine/nodeSearchDatabaseTypes'

const WRITE_BATCH_SIZE = 100
const DELETE_BATCH_SIZE = 250

type SearchDocumentRow = Selectable<SearchDocumentsTable>
export type SearchDocumentWrite = Insertable<SearchDocumentsTable>

export class NodeSearchDocumentRepository {
  constructor(private readonly database: NodeSearchConnection) {}

  withDatabase(database: NodeSearchConnection): NodeSearchDocumentRepository {
    return new NodeSearchDocumentRepository(database)
  }

  async count(): Promise<number> {
    const row = await this.database
      .selectFrom('search_documents')
      .select((expression) => expression.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
    return Number(row.count)
  }

  async list(): Promise<SearchDocumentRow[]> {
    return this.database.selectFrom('search_documents').selectAll().execute()
  }

  async listPage(limit: number, offset: number): Promise<SearchDocumentRow[]> {
    return this.database
      .selectFrom('search_documents')
      .selectAll()
      .orderBy('id')
      .limit(limit)
      .offset(offset)
      .execute()
  }

  async deleteAll(): Promise<void> {
    await this.database.deleteFrom('search_documents').execute()
  }

  async deleteMany(paths: string[], prefixes: string[]): Promise<void> {
    for (const batch of chunks(paths, DELETE_BATCH_SIZE)) {
      await this.database.deleteFrom('search_documents').where('path', 'in', batch).execute()
    }
    for (const batch of chunks(prefixes, DELETE_BATCH_SIZE)) {
      await this.database
        .deleteFrom('search_documents')
        .where(({ and, eb, or }) =>
          or(
            batch.map((prefix) =>
              or([
                eb('path', '=', prefix),
                and([eb('path', '>=', `${prefix}/`), eb('path', '<', `${prefix}0`)]),
              ]),
            ),
          ),
        )
        .execute()
    }
  }

  async upsertMany(documents: SearchDocumentWrite[]): Promise<void> {
    for (const batch of chunks(documents, WRITE_BATCH_SIZE)) {
      await this.database
        .insertInto('search_documents')
        .values(batch)
        .onConflict((conflict) =>
          conflict.column('path').doUpdateSet((expression) => ({
            content: expression.ref('excluded.content'),
            folded_content: expression.ref('excluded.folded_content'),
            folded_path: expression.ref('excluded.folded_path'),
            folded_title: expression.ref('excluded.folded_title'),
            title: expression.ref('excluded.title'),
          })),
        )
        .execute()
    }
  }
}

const chunks = <Value>(values: Value[], size: number): Value[][] => {
  const result: Value[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}
