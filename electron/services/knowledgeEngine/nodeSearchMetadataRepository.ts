import type { NodeSearchConnection } from '@electron/services/knowledgeEngine/nodeSearchDatabaseTypes'

export const SEARCH_METADATA_KEYS = {
  updatedAt: 'updated_at',
  workspaceIdentity: 'workspace_identity',
} as const

export class NodeSearchMetadataRepository {
  constructor(private readonly database: NodeSearchConnection) {}

  withDatabase(database: NodeSearchConnection): NodeSearchMetadataRepository {
    return new NodeSearchMetadataRepository(database)
  }

  async get(key: string): Promise<string | null> {
    const row = await this.database
      .selectFrom('search_metadata')
      .select('value')
      .where('key', '=', key)
      .executeTakeFirst()
    return row?.value || null
  }

  async upsert(key: string, value: string): Promise<void> {
    await this.database
      .insertInto('search_metadata')
      .values({ key, value })
      .onConflict((conflict) => conflict.column('key').doUpdateSet({ value }))
      .execute()
  }
}
