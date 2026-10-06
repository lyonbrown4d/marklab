import type { Kysely } from 'kysely'

import type { NodeSearchDatabaseSchema } from '@electron/services/knowledgeEngine/nodeSearchDatabaseTypes'
import {
  searchFtsCandidates,
  type NodeSearchFtsRow,
} from '@electron/services/knowledgeEngine/nodeSearchFtsSql'

export class NodeSearchFtsRepository {
  constructor(private readonly database: Kysely<NodeSearchDatabaseSchema>) {}

  async search(expression: string, limit: number, offset: number): Promise<NodeSearchFtsRow[]> {
    const result = await searchFtsCandidates(expression, limit, offset).execute(this.database)
    return result.rows
  }
}
