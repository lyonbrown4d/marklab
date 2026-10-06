import {
  allCompiledQuery,
  getCompiledQuery,
  runCompiledQuery,
} from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'

const selection = ['id', 'path'] as const

export class WorkspaceRepository {
  findByCanonicalPath(database: LocalDatabaseService, canonicalPath: string) {
    return getCompiledQuery(
      database.sqlite,
      database.database
        .selectFrom('workspaces')
        .select(selection)
        .where('canonical_path', '=', canonicalPath),
    )
  }

  list(database: LocalDatabaseService) {
    return allCompiledQuery(
      database.sqlite,
      database.database.selectFrom('workspaces').select(selection).orderBy('path'),
    )
  }

  findOrCreate(database: LocalDatabaseService, path: string, canonicalPath: string): number {
    runCompiledQuery(
      database.sqlite,
      database.database
        .insertInto('workspaces')
        .values({ canonical_path: canonicalPath, path, root_kind: 'external' })
        .onConflict((conflict) => conflict.column('canonical_path').doNothing()),
    )
    const workspace = this.findByCanonicalPath(database, canonicalPath)
    if (!workspace) throw new Error('Workspace record could not be created')
    return workspace.id
  }
}
