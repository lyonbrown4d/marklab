import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import type { FsSearchResult } from '@electron/services/workspace/types'
import { isSearchIndexablePath } from '@electron/services/workspace/path'
import type {
  WorkspaceOccurrenceSearchRequest,
  WorkspaceOccurrenceSearchResultSet,
  WorkspaceSearchDocument,
} from '@electron/services/workspace/workspaceSearchTypes'
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
  searchOccurrences?: (
    workspaceId: string,
    request: WorkspaceOccurrenceSearchRequest,
    signal?: AbortSignal,
  ) => Promise<WorkspaceOccurrenceSearchResultSet>
  searchWithOptions?: (
    workspaceId: string,
    query: string,
    options: KnowledgeSearchOptions,
  ) => Promise<KnowledgeSearchResultSet>
  upsertDocument: (workspaceId: string, document: WorkspaceSearchDocument) => Promise<void>
}

type ActiveWorkspaceIndex = {
  indexPath: string
  key: string
  workspaceId: string
}

export class WorkspaceSearchIndex {
  private active: ActiveWorkspaceIndex | null = null
  private desiredKey: string | null = null
  private generation = 0
  private readonly opened = new Map<string, ActiveWorkspaceIndex>()
  private readonly openings = new Map<string, Promise<void>>()
  private readonly workspaceCloseBarriers = new Map<string, Promise<void>>()
  private transitionBarrier: Promise<void> = Promise.resolve()

  constructor(private readonly backend: WorkspaceSearchIndexBackend = createUnavailableBackend()) {}

  async open(indexPath: string, workspaceId = indexPath, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    const normalizedPath = path.resolve(indexPath)
    const key = this.workspaceKey(workspaceId, normalizedPath)
    if (this.active?.key === key) return

    const generation = ++this.generation
    this.desiredKey = key
    if (this.active && this.active.key !== key) {
      const closing = this.scheduleWorkspaceClose(this.active.workspaceId)
      this.transitionBarrier = closing.catch(() => undefined)
      this.active = null
    }

    const opening = this.ensureOpen({ indexPath: normalizedPath, key, workspaceId })
    try {
      await this.waitForOpening(opening, signal)
      signal?.throwIfAborted()
      if (generation !== this.generation || this.desiredKey !== key) {
        void this.closeIfUnused(key).catch(() => undefined)
        return
      }
      this.active = { indexPath: normalizedPath, key, workspaceId }
    } catch (error) {
      if (signal?.aborted) {
        void opening
          .then(
            () => this.closeIfUnused(key),
            () => undefined,
          )
          .catch(() => undefined)
      }
      throw error
    }
  }

  async close(): Promise<void> {
    this.generation += 1
    this.desiredKey = null
    const active = this.active
    this.active = null
    const closing: Promise<unknown>[] = []
    if (active) {
      const activeClose = this.scheduleWorkspaceClose(active.workspaceId)
      this.transitionBarrier = activeClose.catch(() => undefined)
      closing.push(activeClose)
    }
    for (const opened of this.opened.values()) {
      if (opened.key !== active?.key) closing.push(this.scheduleWorkspaceClose(opened.workspaceId))
    }
    for (const [key, opening] of this.openings) {
      closing.push(opening.then(() => this.closeIfUnused(key)))
    }
    const results = await Promise.allSettled(closing)
    const failed = results.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
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

  searchOccurrences(
    request: WorkspaceOccurrenceSearchRequest,
    signal?: AbortSignal,
  ): Promise<WorkspaceOccurrenceSearchResultSet> {
    if (!this.backend.searchOccurrences) {
      throw new Error('Workspace occurrence search is not configured.')
    }
    return this.backend.searchOccurrences(this.requireWorkspaceId(), request, signal)
  }

  private requireWorkspaceId(): string {
    if (!this.active) throw new Error('Workspace search index is not opened.')
    return this.active.workspaceId
  }

  private ensureOpen(workspace: ActiveWorkspaceIndex): Promise<void> {
    const pending = this.openings.get(workspace.key)
    if (pending) return pending
    if (this.opened.has(workspace.key)) return Promise.resolve()

    const transitionBarrier = this.transitionBarrier
    const workspaceBarrier = this.workspaceCloseBarriers.get(workspace.workspaceId)
    const opening = Promise.resolve().then(async () => {
      await transitionBarrier
      await workspaceBarrier
      await mkdir(workspace.indexPath, { recursive: true })
      await this.backend.open(workspace.workspaceId, workspace.indexPath)
      this.opened.set(workspace.key, workspace)
    })
    this.openings.set(workspace.key, opening)
    void opening
      .finally(() => {
        if (this.openings.get(workspace.key) === opening) this.openings.delete(workspace.key)
      })
      .catch(() => undefined)
    return opening
  }

  private closeIfUnused(key: string): Promise<void> {
    if (this.desiredKey === key || this.active?.key === key) return Promise.resolve()
    const workspace = this.opened.get(key)
    if (!workspace) return Promise.resolve()
    return this.scheduleWorkspaceClose(workspace.workspaceId)
  }

  private scheduleWorkspaceClose(workspaceId: string): Promise<void> {
    for (const [key, workspace] of this.opened) {
      if (workspace.workspaceId === workspaceId) this.opened.delete(key)
    }
    const previous = this.workspaceCloseBarriers.get(workspaceId) ?? Promise.resolve()
    const closing = previous.then(() => this.backend.close(workspaceId))
    const barrier = closing.catch(() => undefined)
    this.workspaceCloseBarriers.set(workspaceId, barrier)
    void barrier.finally(() => {
      if (this.workspaceCloseBarriers.get(workspaceId) === barrier) {
        this.workspaceCloseBarriers.delete(workspaceId)
      }
    })
    return closing
  }

  private waitForOpening(opening: Promise<void>, signal?: AbortSignal): Promise<void> {
    if (!signal) return opening
    signal.throwIfAborted()
    return new Promise<void>((resolve, reject) => {
      const abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      void opening.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    })
  }

  private workspaceKey(workspaceId: string, indexPath: string): string {
    return `${workspaceId}\0${indexPath}`
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
