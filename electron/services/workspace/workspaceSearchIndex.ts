import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import type { FsSearchResult } from '@electron/services/workspace/types'
import { isSearchIndexablePath } from '@electron/services/workspace/path'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'
import type { WorkspaceSearchMutationBatch } from '@electron/services/workspace/workspaceSearchTypes'
import type {
  KnowledgeSearchOptions,
  KnowledgeSearchResultSet,
} from '@electron/services/knowledgeEngine/knowledgeSearch'

const MAX_SEARCH_LIMIT = 100

export type { WorkspaceSearchDocument }

export type WorkspaceSearchIndexBackend = {
  applySearchChanges: (workspaceId: string, batch: WorkspaceSearchMutationBatch) => Promise<void>
  close: (workspaceId: string) => Promise<void>
  hasDocuments: (workspaceId: string) => Promise<boolean>
  open: (workspaceId: string, indexPath: string) => Promise<void>
  rebuild: (workspaceId: string, documents: WorkspaceSearchDocument[]) => Promise<void>
  removeDocument: (workspaceId: string, path: string) => Promise<void>
  removePathPrefix: (workspaceId: string, prefix: string) => Promise<void>
  search: (workspaceId: string, query: string, limit: number) => Promise<FsSearchResult[]>
  searchWithOptions?: (
    workspaceId: string,
    query: string,
    options: KnowledgeSearchOptions,
  ) => Promise<KnowledgeSearchResultSet>
  upsertDocument: (workspaceId: string, document: WorkspaceSearchDocument) => Promise<void>
}

export class WorkspaceSearchIndex {
  private indexPath: string | null = null
  private lifecycleQueue: Promise<void> = Promise.resolve()
  private workspaceId: string | null = null

  constructor(private readonly backend: WorkspaceSearchIndexBackend = createUnavailableBackend()) {}

  async open(indexPath: string, workspaceId = indexPath): Promise<void> {
    const normalizedPath = path.resolve(indexPath)
    await this.enqueueLifecycle(async () => {
      if (normalizedPath === this.indexPath && workspaceId === this.workspaceId) return

      await this.closeCurrent()
      await mkdir(normalizedPath, { recursive: true })
      await this.backend.open(workspaceId, normalizedPath)
      this.workspaceId = workspaceId
      this.indexPath = normalizedPath
    })
  }

  async close(): Promise<void> {
    await this.enqueueLifecycle(() => this.closeCurrent())
  }

  private async closeCurrent(): Promise<void> {
    const workspaceId = this.workspaceId
    this.indexPath = null
    this.workspaceId = null
    if (workspaceId) {
      await this.backend.close(workspaceId)
    }
  }

  private enqueueLifecycle<T>(work: () => Promise<T>): Promise<T> {
    const operation = this.lifecycleQueue.then(work)
    this.lifecycleQueue = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }

  async hasDocuments(): Promise<boolean> {
    return this.backend.hasDocuments(this.requireWorkspaceId())
  }

  async rebuild(documents: WorkspaceSearchDocument[]): Promise<void> {
    const indexable = documents.filter((document) => isSearchIndexablePath(document.path))
    await this.backend.rebuild(this.requireWorkspaceId(), indexable)
  }

  async upsertDocument(document: WorkspaceSearchDocument): Promise<void> {
    if (!isSearchIndexablePath(document.path)) return
    await this.backend.upsertDocument(this.requireWorkspaceId(), document)
  }

  async applySearchChanges(batch: WorkspaceSearchMutationBatch): Promise<void> {
    const indexable = batch.upserts.filter((document) => isSearchIndexablePath(document.path))
    await this.backend.applySearchChanges(this.requireWorkspaceId(), {
      ...batch,
      upserts: indexable,
    })
  }

  async removeDocument(pathValue: string): Promise<void> {
    await this.backend.removeDocument(this.requireWorkspaceId(), pathValue)
  }

  async removePathPrefix(prefix: string): Promise<void> {
    await this.backend.removePathPrefix(this.requireWorkspaceId(), prefix)
  }

  async search(query: string, limit: number): Promise<FsSearchResult[]> {
    if (!query.trim()) return []
    const finalLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_LIMIT)
    return this.backend.search(this.requireWorkspaceId(), query, finalLimit)
  }

  async searchWithOptions(
    query: string,
    options: KnowledgeSearchOptions,
  ): Promise<KnowledgeSearchResultSet> {
    if (!query.trim()) return { results: [], totalHits: 0 }
    if (this.backend.searchWithOptions) {
      return this.backend.searchWithOptions(this.requireWorkspaceId(), query, options)
    }
    const results = await this.search(query, options.limit ?? 20)
    return { results, totalHits: results.length }
  }

  private requireWorkspaceId(): string {
    if (!this.workspaceId) throw new Error('Workspace search index is not opened.')
    return this.workspaceId
  }
}

const createUnavailableBackend = (): WorkspaceSearchIndexBackend => ({
  applySearchChanges: async () => {
    throw new Error('Workspace search backend is not configured.')
  },
  close: async () => undefined,
  hasDocuments: async () => {
    throw new Error('Workspace search backend is not configured.')
  },
  open: async () => {
    throw new Error('Workspace search backend is not configured.')
  },
  rebuild: async () => {
    throw new Error('Workspace search backend is not configured.')
  },
  removeDocument: async () => {
    throw new Error('Workspace search backend is not configured.')
  },
  removePathPrefix: async () => {
    throw new Error('Workspace search backend is not configured.')
  },
  search: async () => {
    throw new Error('Workspace search backend is not configured.')
  },
  upsertDocument: async () => {
    throw new Error('Workspace search backend is not configured.')
  },
})
