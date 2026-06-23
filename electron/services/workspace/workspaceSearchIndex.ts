import path from 'node:path'

import type { FsSearchResult } from '@electron/services/workspace/types.js'
import { isSearchIndexablePath } from '@electron/services/workspace/path.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'

const MAX_SEARCH_LIMIT = 100

export type { WorkspaceSearchDocument }

export type WorkspaceSearchIndexBackend = {
  close: () => Promise<void>
  hasDocuments: (workspaceId: string) => Promise<boolean>
  open: (workspaceId: string, indexPath: string) => Promise<void>
  rebuild: (workspaceId: string, documents: WorkspaceSearchDocument[]) => Promise<void>
  removeDocument: (workspaceId: string, path: string) => Promise<void>
  removePathPrefix: (workspaceId: string, prefix: string) => Promise<void>
  search: (workspaceId: string, query: string, limit: number) => Promise<FsSearchResult[]>
  upsertDocument: (workspaceId: string, document: WorkspaceSearchDocument) => Promise<void>
}

export class WorkspaceSearchIndex {
  private indexPath: string | null = null
  private workspaceId: string | null = null

  constructor(private readonly backend: WorkspaceSearchIndexBackend = createUnavailableBackend()) {}

  async open(indexPath: string): Promise<void> {
    const normalizedPath = path.resolve(indexPath)
    if (normalizedPath === this.indexPath && this.workspaceId) return

    await this.close()
    this.workspaceId = normalizedPath
    await this.backend.open(this.workspaceId, normalizedPath)
    this.indexPath = normalizedPath
  }

  async close(): Promise<void> {
    await this.backend.close()
    this.indexPath = null
    this.workspaceId = null
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

  private requireWorkspaceId(): string {
    if (!this.workspaceId) throw new Error('Workspace search index is not opened.')
    return this.workspaceId
  }
}

const createUnavailableBackend = (): WorkspaceSearchIndexBackend => ({
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
