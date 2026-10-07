import type { Logger } from '@electron/services/logger'
import type { FsSearchResult } from '@electron/services/workspace/types'
import type { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex'
import { WorkspaceOccurrenceSearchCoordinator } from '@electron/services/workspace/workspaceOccurrenceSearchCoordinator'
import { stringArg } from '@electron/services/workspace/workspaceUtils'

type WorkspaceSearchOperationsOptions = {
  activeSearchKey: () => string
  index: WorkspaceSearchIndex
  logger: Logger
  prepare: () => Promise<void>
  runTask: <Value>(work: () => Promise<Value>, taskName: string) => Promise<Value>
}

export class WorkspaceSearchOperations {
  private readonly occurrences: WorkspaceOccurrenceSearchCoordinator

  constructor(private readonly options: WorkspaceSearchOperationsOptions) {
    this.occurrences = new WorkspaceOccurrenceSearchCoordinator({
      prepare: () => options.runTask(options.prepare, 'prepare-occurrence-search'),
      search: (request, signal) => options.index.searchOccurrences(request, signal),
    })
  }

  async search(value: unknown): Promise<FsSearchResult[]> {
    const query = stringArg(value, 'query')
    const limitValue = value && typeof value === 'object' && 'limit' in value ? value.limit : 20
    const limit = typeof limitValue === 'number' && Number.isFinite(limitValue) ? limitValue : 20

    return this.options.runTask(async () => {
      await this.options.prepare()
      const results = await this.options.index.search(query, limit)
      this.options.logger.info('workspace search completed', {
        queryLength: query.length,
        resultCount: results.length,
        searchKey: this.options.activeSearchKey().slice(0, 12),
      })
      return results
    }, 'search-documents')
  }

  searchOccurrences(value: unknown) {
    return this.occurrences.search(value)
  }

  cancelOccurrenceSearch(value: unknown) {
    return this.occurrences.cancel(value)
  }

  dispose(): void {
    this.occurrences.dispose()
  }
}
