import type {
  WorkspaceSearchDocument,
  WorkspaceSearchMutationBatch,
} from '@electron/services/workspace/workspaceSearchTypes'
import type {
  KnowledgeSearchOptions,
  KnowledgeSearchResultSet,
} from '@electron/services/knowledgeEngine/knowledgeSearch'
import { searchLimitValue } from '@electron/services/knowledgeEngine/knowledgeSearch'
import {
  buildNodeSearchDocuments,
  type NodeSearchBuildOptions,
} from '@electron/services/knowledgeEngine/nodeSearchBuild'
import { NodeSearchDatabase } from '@electron/services/knowledgeEngine/nodeSearchDatabase'
import {
  includeDocumentPath,
  normalizeSearchDocument,
  normalizeSearchOffset,
  normalizeSearchPath,
  searchErrorMessage,
  sortSearchResults,
} from '@electron/services/knowledgeEngine/nodeSearchIndexSupport'
import {
  emptyNodeSearchIndexStats,
  type NodeSearchIndexStats,
} from '@electron/services/knowledgeEngine/nodeSearchStats'
import {
  queryTerms,
  resultForSearchDocument,
} from '@electron/services/knowledgeEngine/nodeSearchText'
import type {
  WorkspaceOccurrenceSearchRequest,
  WorkspaceOccurrenceSearchResultSet,
} from '@electron/services/workspace/workspaceSearchTypes'
import type {
  OccurrenceSearchInput,
  OccurrenceSearchOutput,
} from '@electron/services/knowledgeEngine/workspaceOccurrenceSearch'
import { WorkspaceOccurrenceSearchWorkerClient } from '@electron/services/knowledgeEngine/workspaceOccurrenceSearchWorkerClient'

export type { NodeSearchIndexStats } from '@electron/services/knowledgeEngine/nodeSearchStats'

const MAX_OCCURRENCE_DOCUMENTS = 2_000
const MAX_OCCURRENCE_CHARACTERS = 8 * 1024 * 1024
const MAX_OCCURRENCE_DOCUMENT_CHARACTERS = 2 * 1024 * 1024
const MAX_OCCURRENCE_RESULTS = 500

type OccurrenceSearchRunner = {
  run: (
    documents: WorkspaceSearchDocument[],
    input: OccurrenceSearchInput,
    signal?: AbortSignal,
  ) => Promise<OccurrenceSearchOutput>
}

export class NodeSearchIndex {
  private closePromise?: Promise<void>
  private closed = false
  private database: NodeSearchDatabase | null = null
  private loadPromise?: Promise<void>
  private mutationQueue: Promise<void> = Promise.resolve()
  private readonly readOperations = new Set<Promise<unknown>>()
  private rebuildGeneration = 0
  private stats: NodeSearchIndexStats = emptyNodeSearchIndexStats()

  constructor(
    private readonly storageDirectory?: string,
    private readonly workspaceIdentity = '',
    private readonly buildOptions: NodeSearchBuildOptions = {},
    private readonly occurrenceSearch: OccurrenceSearchRunner = new WorkspaceOccurrenceSearchWorkerClient(),
  ) {}

  get size(): number {
    return this.stats.documentCount
  }

  getSize(): Promise<number> {
    return this.runRead(async () => {
      await this.readyForRead()
      return this.stats.documentCount
    })
  }

  async hasDocuments(): Promise<boolean> {
    return (await this.getSize()) > 0
  }

  getStats(): Promise<NodeSearchIndexStats> {
    return this.runRead(async () => {
      await this.readyForRead()
      return { ...this.stats }
    })
  }

  cancelPendingRebuild(): void {
    this.rebuildGeneration += 1
    this.stats = { ...this.stats, building: false }
  }

  rebuild(documents: WorkspaceSearchDocument[]): Promise<void> {
    if (this.closed) return Promise.reject(this.closedError())
    const generation = ++this.rebuildGeneration
    this.stats = { ...this.stats, building: true, lastBuildError: null, lastError: null }
    const operation = this.mutationQueue.then(async () => {
      const startedAt = performance.now()
      try {
        await this.ensureLoaded()
        const normalized = await buildNodeSearchDocuments(
          documents,
          normalizeSearchDocument,
          this.buildOptions,
          () => generation === this.rebuildGeneration,
        )
        if (!normalized || generation !== this.rebuildGeneration) return
        const persisted = await this.getDatabase().replaceAll(
          normalized,
          () => generation === this.rebuildGeneration,
        )
        if (!persisted.committed || generation !== this.rebuildGeneration) return
        const databaseStats = await this.getDatabase().stats()
        this.stats = {
          building: false,
          documentCount: normalized.length,
          indexBytes: databaseStats.indexBytes,
          lastBuildDurationMs: performance.now() - startedAt,
          lastBuildError: null,
          lastError: null,
          updatedAt: persisted.updatedAt,
        }
      } catch (error) {
        if (generation === this.rebuildGeneration) {
          const message = searchErrorMessage(error)
          this.stats = {
            ...this.stats,
            building: false,
            lastBuildDurationMs: performance.now() - startedAt,
            lastBuildError: message,
            lastError: message,
          }
        }
        throw error
      }
    })
    this.mutationQueue = operation.catch(() => undefined)
    return operation
  }

  upsert(document: WorkspaceSearchDocument): Promise<void> {
    return this.applyBatch({ removeDocuments: [], removePrefixes: [], upserts: [document] })
  }

  remove(documentPath: string): Promise<void> {
    return this.applyBatch({ removeDocuments: [documentPath], removePrefixes: [], upserts: [] })
  }

  removePrefix(prefix: string): Promise<void> {
    return this.applyBatch({ removeDocuments: [], removePrefixes: [prefix], upserts: [] })
  }

  applyBatch(batch: WorkspaceSearchMutationBatch): Promise<void> {
    return this.mutate(batch)
  }

  search(query: string, options: KnowledgeSearchOptions = {}): Promise<KnowledgeSearchResultSet> {
    return this.runRead(() => this.performSearch(query, options))
  }

  searchOccurrences(
    request: WorkspaceOccurrenceSearchRequest,
    signal?: AbortSignal,
  ): Promise<WorkspaceOccurrenceSearchResultSet> {
    return this.runRead(async () => {
      this.assertOpen()
      await this.readyForRead()
      const batch = await this.getDatabase().occurrenceDocuments(
        MAX_OCCURRENCE_DOCUMENTS,
        MAX_OCCURRENCE_CHARACTERS,
        MAX_OCCURRENCE_DOCUMENT_CHARACTERS,
      )
      const result = await this.occurrenceSearch.run(
        batch.documents,
        {
          ...request.options,
          limit: Math.min(Math.max(Math.trunc(request.limit ?? 100), 1), MAX_OCCURRENCE_RESULTS),
          query: request.query,
        },
        signal,
      )
      return {
        ...result,
        requestId: request.requestId,
        scannedDocuments: batch.documents.length,
        truncated: batch.truncated,
      }
    })
  }

  private async performSearch(
    query: string,
    options: KnowledgeSearchOptions,
  ): Promise<KnowledgeSearchResultSet> {
    this.assertOpen()
    const startedAt = performance.now()
    await this.readyForRead()
    const terms = queryTerms(query)
    const limit = searchLimitValue(options.limit)
    const offset = normalizeSearchOffset(options.offset)
    if (terms.length === 0) return { results: [], totalHits: 0 }
    const includes = (options.includePaths ?? []).map(normalizeSearchPath)
    const retained = []
    let totalHits = 0
    const retainCount = offset + limit
    for await (const batch of this.getDatabase().searchBatches(terms)) {
      const matches = batch
        .filter((document) => includeDocumentPath(document.path, includes))
        .map((document) =>
          resultForSearchDocument(document, query, document.score, document.indexedMatches),
        )
      totalHits += matches.length
      retained.push(...matches)
      sortSearchResults(retained, options.order)
      if (retained.length > retainCount) retained.length = retainCount
    }
    const results = retained.slice(offset, offset + limit)
    return {
      results,
      totalHits,
      ...(options.includeDiagnostics
        ? {
            diagnostics: {
              elapsedMs: performance.now() - startedAt,
              limit,
              offset,
              returnedHits: results.length,
              totalHits,
            },
          }
        : {}),
    }
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise
    this.closed = true
    this.closePromise = this.finishClose()
    return this.closePromise
  }

  private async readyForRead(): Promise<void> {
    await this.ensureLoaded()
    await this.mutationQueue
  }

  private ensureLoaded(): Promise<void> {
    this.loadPromise ??= Promise.resolve().then(async () => {
      this.database = new NodeSearchDatabase(this.storageDirectory, this.workspaceIdentity)
      await this.database.initialize()
      const databaseStats = await this.database.stats()
      this.stats = {
        ...this.stats,
        documentCount: await this.database.count(),
        indexBytes: databaseStats.indexBytes,
        lastError: null,
        updatedAt: databaseStats.updatedAt,
      }
    })
    return this.loadPromise
  }

  private mutate(batch: WorkspaceSearchMutationBatch): Promise<void> {
    if (this.closed) return Promise.reject(this.closedError())
    const operation = this.mutationQueue.then(async () => {
      await this.ensureLoaded()
      try {
        const updatedAt = await this.getDatabase().applyBatch(batch)
        const databaseStats = await this.getDatabase().stats()
        this.stats = {
          ...this.stats,
          documentCount: await this.getDatabase().count(),
          indexBytes: databaseStats.indexBytes,
          lastError: null,
          updatedAt,
        }
      } catch (error) {
        this.stats = { ...this.stats, lastError: searchErrorMessage(error) }
        throw error
      }
    })
    this.mutationQueue = operation.catch(() => undefined)
    return operation
  }

  private getDatabase(): NodeSearchDatabase {
    if (!this.database) throw new Error('Node search database is not initialized.')
    return this.database
  }

  private assertOpen(): void {
    if (this.closed) throw this.closedError()
  }

  private closedError(): Error {
    return new Error('Node search index is closed.')
  }

  private async finishClose(): Promise<void> {
    this.cancelPendingRebuild()
    await this.loadPromise?.catch(() => undefined)
    await this.mutationQueue.catch(() => undefined)
    await Promise.allSettled([...this.readOperations])
    const database = this.database
    this.database = null
    this.loadPromise = undefined
    await database?.close()
  }

  private runRead<Value>(work: () => Promise<Value>): Promise<Value> {
    if (this.closed) return Promise.reject(this.closedError())
    const operation = Promise.resolve().then(work)
    this.readOperations.add(operation)
    void operation.finally(() => this.readOperations.delete(operation)).catch(() => undefined)
    return operation
  }
}
