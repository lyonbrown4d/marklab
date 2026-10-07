import type { FsWorkspaceIndex } from '@electron/services/workspace/types'
import {
  queryWorkspaceDocumentInsights,
  queryWorkspaceKnowledgeSummary,
  queryWorkspaceNavigation,
} from '@electron/services/workspace/workspaceIndexQueries'
import {
  paginateWorkspacePages,
  prepareWorkspacePageQuery,
  type WorkspacePageProjection,
} from '@electron/services/workspace/workspacePageQueries'
import type {
  WorkspaceNavigationQuery,
  WorkspacePageQuery,
} from '@electron/services/workspace/workspaceIndexQueryTypes'

type WorkspaceIndexQueryServiceOptions = {
  getRevision: () => number
  load: () => Promise<FsWorkspaceIndex>
}

export class WorkspaceIndexQueryService {
  private pageCacheRevision = -1
  private readonly pageCache = new Map<string, WorkspacePageProjection>()

  constructor(private readonly options: WorkspaceIndexQueryServiceOptions) {}

  async workspacePageQuery(query: WorkspacePageQuery = {}) {
    const snapshot = await this.snapshot()
    if (this.pageCacheRevision !== snapshot.revision) {
      this.pageCacheRevision = snapshot.revision
      this.pageCache.clear()
    }
    const cacheKey = pageQueryCacheKey(query)
    let projection = this.pageCache.get(cacheKey)
    if (!projection) {
      projection = prepareWorkspacePageQuery(snapshot.index, query)
      this.pageCache.set(cacheKey, projection)
      if (this.pageCache.size > 12) this.pageCache.delete(this.pageCache.keys().next().value!)
    }
    return paginateWorkspacePages(projection, snapshot.revision, query)
  }

  async workspaceNavigationQuery(query: WorkspaceNavigationQuery = {}) {
    const snapshot = await this.snapshot()
    return queryWorkspaceNavigation(snapshot.index, snapshot.revision, query)
  }

  async workspaceDocumentInsights(path: string, assetLimit = 80) {
    const snapshot = await this.snapshot()
    return queryWorkspaceDocumentInsights(snapshot.index, path, snapshot.revision, assetLimit)
  }

  async workspaceKnowledgeSummary() {
    const snapshot = await this.snapshot()
    return queryWorkspaceKnowledgeSummary(snapshot.index, snapshot.revision)
  }

  private async snapshot() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const revision = this.options.getRevision()
      const index = await this.options.load()
      if (revision === this.options.getRevision()) return { index, revision }
    }
    throw new Error('Workspace analysis changed while the query was running')
  }
}

const pageQueryCacheKey = ({
  folder = 'all',
  issues_only = false,
  query = '',
  sort = 'title',
}: WorkspacePageQuery): string => JSON.stringify([folder.trim(), issues_only, query.trim(), sort])
