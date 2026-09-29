import path from 'node:path'

import MiniSearch, { type SearchResult } from 'minisearch'

import type { FsSearchResult } from '@electron/services/workspace/types.js'
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

type IndexedCandidate = {
  matches: string[]
  score: number
}

export class NodeSearchIndex {
  private readonly documents = new Map<string, WorkspaceSearchDocument>()
  private miniSearch = createMiniSearch()
  private readonly snapshot?: NodeSearchSnapshot
  private loadPromise?: Promise<void>
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(storageDirectory?: string, workspaceIdentity = '') {
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

  rebuild(documents: WorkspaceSearchDocument[]): Promise<void> {
    return this.mutate(() => {
      this.documents.clear()
      for (const document of documents) this.store(document)
    })
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
      for (const prefix of batch.removePrefixes) this.removeNormalizedPrefix(prefix)
      for (const document of batch.upserts) this.store(document)
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
    const offset = normalizeOffset(options.offset)
    if (terms.length === 0) return { results: [], totalHits: 0 }

    const includes = (options.includePaths ?? []).map(normalizeSearchPath)
    const candidates = this.indexedCandidates(query)
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
    sortResults(matches, options.order)
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

  private indexedCandidates(query: string): Map<string, IndexedCandidate> {
    const candidates = new Map<string, IndexedCandidate>()
    for (const result of this.miniSearch.search(query, nodeSearchQueryOptions())) {
      const documentPath = resultPath(result)
      if (!documentPath) continue
      candidates.set(documentPath, {
        matches: Object.keys(result.match),
        score: result.score,
      })
    }
    return candidates
  }

  private store(document: WorkspaceSearchDocument): void {
    const normalizedPath = normalizeSearchPath(document.path)
    if (!normalizedPath || normalizedPath === '.') {
      throw new TypeError('Search document path must identify a workspace file.')
    }
    this.documents.set(normalizedPath, { ...document, path: normalizedPath })
  }

  private removeNormalizedPrefix(prefix: string): void {
    const normalizedPrefix = normalizeSearchPath(prefix)
    for (const documentPath of this.documents.keys()) {
      if (pathMatchesInclude(documentPath, normalizedPrefix)) this.documents.delete(documentPath)
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
    for (const document of loaded.documents) this.store(document)
    if (loaded.serializedIndex && this.tryRestoreMiniSearch(loaded.serializedIndex)) return
    this.rebuildMiniSearch()
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
        this.rebuildMiniSearch()
        await this.persist()
      } catch (error) {
        this.documents.clear()
        for (const [documentPath, document] of previous) {
          this.documents.set(documentPath, document)
        }
        this.rebuildMiniSearch()
        throw error
      }
    })
    this.mutationQueue = operation.catch(() => undefined)
    return operation
  }

  private rebuildMiniSearch(): void {
    const next = createMiniSearch()
    next.addAll([...this.documents.values()])
    this.miniSearch = next
  }

  private async persist(): Promise<void> {
    await this.snapshot?.write([...this.documents.values()], this.miniSearch.toJSON())
  }
}

const resultPath = (result: SearchResult): string | null => {
  const pathValue = typeof result.path === 'string' ? result.path : result.id
  return typeof pathValue === 'string' ? normalizeSearchPath(pathValue) : null
}

const normalizeSearchPath = (value: string): string => {
  let normalized = value
    .trim()
    .replaceAll('\\', '/')
    .replace(/\/{2,}/g, '/')
  while (normalized.startsWith('./')) normalized = normalized.slice(2)
  while (normalized.endsWith('/')) normalized = normalized.slice(0, -1)
  return normalized
}

const includeDocumentPath = (documentPath: string, includes: string[]): boolean =>
  includes.length === 0 || includes.some((include) => pathMatchesInclude(documentPath, include))

const pathMatchesInclude = (documentPath: string, include: string): boolean =>
  !include || include === '.' || documentPath === include || documentPath.startsWith(`${include}/`)

const normalizeOffset = (offset?: number): number =>
  typeof offset === 'number' && Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const sortResults = (results: FsSearchResult[], order: KnowledgeSearchOptions['order']): void => {
  results.sort((left, right) => {
    if (order === 'path') {
      return (
        compareText(left.path, right.path) ||
        right.score - left.score ||
        compareText(left.title, right.title)
      )
    }
    if (order === 'title') {
      return (
        compareText(left.title, right.title) ||
        right.score - left.score ||
        compareText(left.path, right.path)
      )
    }
    if (order === 'pathThenScore') {
      return compareText(left.path, right.path) || right.score - left.score
    }
    return right.score - left.score || compareText(left.path, right.path)
  })
}
