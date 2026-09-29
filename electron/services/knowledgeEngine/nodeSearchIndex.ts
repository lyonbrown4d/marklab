import path from 'node:path'

import type { FsSearchResult } from '@electron/services/workspace/types.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'
import type {
  KnowledgeSearchOptions,
  KnowledgeSearchResultSet,
} from '@electron/services/knowledgeEngine/knowledgeSearch.js'
import { searchLimitValue } from '@electron/services/knowledgeEngine/knowledgeSearch.js'
import { NodeSearchSnapshot } from '@electron/services/knowledgeEngine/nodeSearchSnapshot.js'

export class NodeSearchIndex {
  private readonly documents = new Map<string, WorkspaceSearchDocument>()
  private readonly snapshot?: NodeSearchSnapshot
  private loadPromise?: Promise<void>
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(storageDirectory?: string) {
    this.snapshot = storageDirectory
      ? new NodeSearchSnapshot(path.resolve(storageDirectory))
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
    return this.mutate(() => this.store(document))
  }

  remove(documentPath: string): Promise<void> {
    return this.mutate(() => {
      this.documents.delete(normalizeSearchPath(documentPath))
    })
  }

  removePrefix(prefix: string): Promise<void> {
    return this.mutate(() => {
      const normalizedPrefix = normalizeSearchPath(prefix)
      for (const documentPath of this.documents.keys()) {
        if (pathMatchesInclude(documentPath, normalizedPrefix)) this.documents.delete(documentPath)
      }
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
    const matches = [...this.documents.values()]
      .filter((document) => includeDocumentPath(document.path, includes))
      .map((document) => resultForDocument(document, terms))
      .filter((result): result is FsSearchResult => result !== null)
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

  private store(document: WorkspaceSearchDocument): void {
    const normalizedPath = normalizeSearchPath(document.path)
    if (!normalizedPath || normalizedPath === '.') {
      throw new TypeError('Search document path must identify a workspace file.')
    }
    this.documents.set(normalizedPath, { ...document, path: normalizedPath })
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
    for (const document of await this.snapshot.load()) this.store(document)
  }

  private mutate(change: () => void): Promise<void> {
    const operation = this.mutationQueue.then(async () => {
      await this.ensureLoaded()
      const previous = new Map(this.documents)
      change()
      try {
        await this.persist()
      } catch (error) {
        this.documents.clear()
        for (const [documentPath, document] of previous) {
          this.documents.set(documentPath, document)
        }
        throw error
      }
    })
    this.mutationQueue = operation.catch(() => undefined)
    return operation
  }

  private async persist(): Promise<void> {
    await this.snapshot?.write([...this.documents.values()])
  }
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

const queryTerms = (query: string): string[] => foldText(query).split(/\s+/).filter(Boolean)

const foldText = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .replace(/[øØ]/g, 'o')
    .replace(/[łŁ]/g, 'l')
    .replace(/[ðÐ]/g, 'd')
    .replace(/[þÞ]/g, 'th')
    .replace(/ß/g, 'ss')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .toLocaleLowerCase()

const resultForDocument = (
  document: WorkspaceSearchDocument,
  terms: string[],
): FsSearchResult | null => {
  const foldedTitle = foldText(document.title)
  const foldedPath = foldText(document.path)
  const foldedContent = foldText(document.content)
  const haystack = `${foldedTitle}\n${foldedPath}\n${foldedContent}`
  if (!terms.every((term) => haystack.includes(term))) return null

  const lines = document.content.split(/\r?\n/)
  const titleMatches = terms.some((term) => foldedTitle.includes(term))
  const lineIndex = titleMatches
    ? -1
    : lines.findIndex((line) => terms.some((term) => foldText(line).includes(term)))
  const snippet = titleMatches ? document.title : (lines[lineIndex] ?? document.title)
  const highlights = highlightsForSnippet(snippet, terms)
  const firstHighlight = highlights[0]
  const score =
    12 * terms.filter((term) => foldedTitle.includes(term)).length +
    8 * terms.filter((term) => foldedPath.includes(term)).length +
    4 * terms.filter((term) => foldedContent.includes(term)).length
  return {
    column: (firstHighlight?.start ?? 0) + 1,
    end_column: (firstHighlight?.end ?? 0) + 1,
    line: lineIndex >= 0 ? lineIndex + 1 : 1,
    path: document.path,
    score,
    snippet,
    snippet_highlights: highlights,
    title: document.title,
  }
}

const highlightsForSnippet = (
  snippet: string,
  terms: string[],
): Array<{ start: number; end: number }> => {
  const folded = foldText(snippet)
  return terms.flatMap((term) => {
    const start = folded.indexOf(term)
    return start >= 0 ? [{ start, end: start + term.length }] : []
  })
}

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
