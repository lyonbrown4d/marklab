import { allCompiledQuery, runCompiledQuery } from '@electron/database/compiledQuery'
import type { LocalDatabaseService } from '@electron/database/service'

export class RecentWorkspaceRepository {
  constructor(private readonly localDatabase: LocalDatabaseService) {}

  list(limit: number): string[] {
    return allCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database
        .selectFrom('recent_workspaces')
        .select('workspace_path')
        .orderBy('position')
        .limit(limit),
    ).map(({ workspace_path }) => workspace_path)
  }

  replace(paths: string[]): void {
    const lastOpenedAt = new Date().toISOString()
    runCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database.deleteFrom('recent_workspaces'),
    )
    if (paths.length === 0) return
    runCompiledQuery(
      this.localDatabase.sqlite,
      this.localDatabase.database.insertInto('recent_workspaces').values(
        paths.map((workspacePath, position) => ({
          last_opened_at: lastOpenedAt,
          position,
          workspace_path: workspacePath,
        })),
      ),
    )
  }
}
