import path from 'node:path'

import MiniSearch from 'minisearch'

import type {
  WorkspaceSearchDocument,
  WorkspaceSearchMutationBatch,
} from '@electron/services/workspace/workspaceSearchTypes.js'
import type {
  KnowledgeSearchOptions,
  KnowledgeSearchResultSet,
} from '@electron/services/knowledgeEngine/knowledgeSearch.js'
import { searchLimitValue } from '@electron/services/knowledgeEngine/knowledgeSearch.js'
import {
  createMiniSearch,
  nodeSearchMiniSearchOptions,
  nodeSearchQueryOptions,
} from '@electron/services/knowledgeEngine/nodeSearchConfig.js'
import { NodeSearchSnapshot } from '@electron/services/knowledgeEngine/nodeSearchSnapshot.js'
import {
  documentContainsAllTerms,
  queryTerms,
  resultForSearchDocument,
} from '@electron/services/knowledgeEngine/nodeSearchText.js'
import {
  buildNodeSearchIndex,
  type NodeSearchBuildOptions,
} from '@electron/services/knowledgeEngine/nodeSearchBuild.js'
import {
  applyIncrementalIndexChanges,
  includeDocumentPath,
  indexedSearchCandidates,
  normalizeSearchDocument,
  normalizeSearchOffset,
  normalizeSearchPath,
  rebuildMiniSearch,
  removeSearchPathPrefix,
  searchErrorMessage,
  serializedIndexBytes,
  storeSearchDocument,
  sortSearchResults,
} from '@electron/services/knowledgeEngine/nodeSearchIndexSupport.js'
import {
  emptyNodeSearchIndexStats,
  type NodeSearchIndexStats,
} from '@electron/services/knowledgeEngine/nodeSearchStats.js'

export type { NodeSearchIndexStats } from '@electron/services/knowledgeEngine/nodeSearchStats.js'

export class NodeSearchIndex {
  private documents = new Map<string, WorkspaceSearchDocument>()
  private miniSearch = createMiniSearch()
  private readonly snapshot?: NodeSearchSnapshot
  private loadPromise?: Promise<void>
  private mutationQueue: Promise<void> = Promise.resolve()
  private rebuildGeneration = 0
  private activeBuildAbortController: AbortController | null = null
  private stats: NodeSearchIndexStats = emptyNodeSearchIndexStats()

  constructor(
    storageDirectory?: string,
    private readonly workspaceIdentity = '',
    private readonly buildOptions: NodeSearchBuildOptions = {},
  ) {
    this.snapshot = storageDirectory
      ? new NodeSearchSnapshot(path.resolve(storageDirectory), workspaceIdentity)
      : undefined
  }

  get size(): number {
    return this.documents.size
  }

  async getSize(): Promise<number> {
    await this.readyForRead()
    return this.documents.size
  }

  async hasDocuments(): Promise<boolean> {
    return (await this.getSize()) > 0
  }

  async getStats(): Promise<NodeSearchIndexStats> {
    await this.ensureLoaded()
    return { ...this.stats, documentCount: this.documents.size }
  }

  cancelPendingRebuild(): void {
    this.rebuildGeneration += 1
    this.activeBuildAbortController?.abort()
    this.stats = { ...this.stats, building: false }
  }

  rebuild(documents: WorkspaceSearchDocument[]): Promise<void> {
    this.activeBuildAbortController?.abort()
    const generation = ++this.rebuildGeneration
    const abortController = new AbortController()
    this.stats = {
      ...this.stats,
      building: true,
      lastBuildError: null,
      lastError: null,
    }
    const operation = this.mutationQueue.then(async () => {
      const startedAt = performance.now()
      try {
        await this.ensureLoaded()
        if (generation !== this.rebuildGeneration) return
        this.activeBuildAbortController = abortController
        const built = await buildNodeSearchIndex(
          documents,
          normalizeSearchDocument,
          {
            ...this.buildOptions,
            abortSignal: abortController.signal,
            workspaceIdentity: this.workspaceIdentity,
          },
          () => generation === this.rebuildGeneration,
        )
        if (!built) return
        const serializedIndex = built.serializedIndex ?? built.miniSearch.toJSON()
        const persisted = await this.persist(
          built.documents,
          serializedIndex,
          () => generation === this.rebuildGeneration,
        )
        if (!persisted.committed || generation !== this.rebuildGeneration) return
        this.documents = built.documents
        this.miniSearch = built.miniSearch
        this.stats = {
          building: false,
          documentCount: built.documents.size,
          indexBytes: built.indexBytes ?? serializedIndexBytes(serializedIndex),
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
      } finally {
        if (this.activeBuildAbortController === abortController) {
          this.activeBuildAbortController = null
        }
      }
    })
    this.mutationQueue = operation.catch(() => undefined)
    return operation
  }

  upsert(document: WorkspaceSearchDocument): Promise<void> {
    return this.applyBatch({ removeDocuments: [], removePrefixes: [], upserts: [document] })
  }

  remove(documentPath: string): Promise<void> {
    return this.applyBatch({
      removeDocuments: [documentPath],
      removePrefixes: [],
      upserts: [],
    })
  }

  removePrefix(prefix: string): Promise<void> {
    return this.applyBatch({ removeDocuments: [], removePrefixes: [prefix], upserts: [] })
  }

  applyBatch(batch: WorkspaceSearchMutationBatch): Promise<void> {
    return this.mutate(() => {
      for (const documentPath of batch.removeDocuments) {
        this.documents.delete(normalizeSearchPath(documentPath))
      }
      for (const prefix of batch.removePrefixes) removeSearchPathPrefix(this.documents, prefix)
      for (const document of batch.upserts) storeSearchDocument(this.documents, document)
    })
  }

  async search(
    query: string,
    options: KnowledgeSearchOptions = {},
  ): Promise<KnowledgeSearchResultSet> {
    const startedAt = performance.now()
    await this.readyForRead()
    const terms = queryTerms(query)
    const limit = searchLimitValue(options.limit)
    const offset = normalizeSearchOffset(options.offset)
    if (terms.length === 0) return { results: [], totalHits: 0 }

    const includes = (options.includePaths ?? []).map(normalizeSearchPath)
    const candidates = indexedSearchCandidates(this.miniSearch, query, nodeSearchQueryOptions())
    for (const document of this.documents.values()) {
      if (documentContainsAllTerms(document, terms) && !candidates.has(document.path)) {
        candidates.set(document.path, { matches: terms, score: 0 })
      }
    }
    const matches = [...candidates.entries()].flatMap(([documentPath, candidate]) => {
      const document = this.documents.get(documentPath)
      if (!document || !includeDocumentPath(document.path, includes)) return []
      return [resultForSearchDocument(document, query, candidate.score, candidate.matches)]
    })
    sortSearchResults(matches, options.order)
    const results = matches.slice(offset, offset + limit)

    return {
      results,
      totalHits: matches.length,
      ...(options.includeDiagnostics
        ? {
            diagnostics: {
              elapsedMs: performance.now() - startedAt,
              limit,
              offset,
              returnedHits: results.length,
              totalHits: matches.length,
            },
          }
        : {}),
    }
  }

  private async readyForRead(): Promise<void> {
    await this.ensureLoaded()
    await this.mutationQueue
  }

  private ensureLoaded(): Promise<void> {
    this.loadPromise ??= this.load()
    return this.loadPromise
  }

  private async load(): Promise<void> {
    if (!this.snapshot) return
    const loaded = await this.snapshot.load()
    for (const document of loaded.documents) storeSearchDocument(this.documents, document)
    this.stats = {
      ...this.stats,
      documentCount: this.documents.size,
      lastError: loaded.recoveryError ?? null,
      updatedAt: loaded.updatedAt ?? null,
    }
    if (loaded.serializedIndex && this.tryRestoreMiniSearch(loaded.serializedIndex)) {
      this.stats = {
        ...this.stats,
        indexBytes: serializedIndexBytes(loaded.serializedIndex),
      }
      return
    }
    const built = await buildNodeSearchIndex(
      [...this.documents.values()],
      normalizeSearchDocument,
      { ...this.buildOptions, workspaceIdentity: this.workspaceIdentity },
      () => true,
    )
    if (built) this.miniSearch = built.miniSearch
    this.stats = {
      ...this.stats,
      indexBytes: serializedIndexBytes(this.miniSearch.toJSON()),
    }
  }

  private tryRestoreMiniSearch(serializedIndex: unknown): boolean {
    try {
      const restored = MiniSearch.loadJSON<WorkspaceSearchDocument>(
        JSON.stringify(serializedIndex),
        nodeSearchMiniSearchOptions(),
      )
      if (restored.documentCount !== this.documents.size) return false
      this.miniSearch = restored
      return true
    } catch {
      return false
    }
  }

  private mutate(change: () => void): Promise<void> {
    const operation = this.mutationQueue.then(async () => {
      await this.ensureLoaded()
      const previous = new Map(this.documents)
      try {
        change()
        applyIncrementalIndexChanges(this.miniSearch, previous, this.documents)
        const serializedIndex = this.miniSearch.toJSON()
        const persisted = await this.persist(this.documents, serializedIndex)
        this.stats = {
          ...this.stats,
          documentCount: this.documents.size,
          indexBytes: serializedIndexBytes(serializedIndex),
          lastError: null,
          updatedAt: persisted.updatedAt,
        }
      } catch (error) {
        this.documents = previous
        this.miniSearch = rebuildMiniSearch(this.documents.values())
        this.stats = { ...this.stats, lastError: searchErrorMessage(error) }
        throw error
      }
    })
    this.mutationQueue = operation.catch(() => undefined)
    return operation
  }

  private async persist(
    documents: Map<string, WorkspaceSearchDocument>,
    serializedIndex: unknown,
    shouldCommit: () => boolean = () => true,
  ): Promise<{ committed: boolean; updatedAt: string }> {
    const written = await this.snapshot?.write(
      [...documents.values()],
      serializedIndex,
      shouldCommit,
    )
    return written ?? { committed: shouldCommit(), updatedAt: new Date().toISOString() }
  }
}
