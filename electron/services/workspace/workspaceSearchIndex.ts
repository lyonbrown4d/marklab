import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { FsSearchResult } from '@electron/services/workspace/types.js'
import { isMarkdownPath } from '@electron/services/workspace/path.js'
import { buildMatchExpression } from '@electron/services/workspace/workspaceSearchIndexHelpers.js'
import { parseSearchTerms, searchDocuments } from '@electron/services/workspace/markdown/search.js'
import {
  ensureSearchSchema,
  openSearchDatabase,
  runSqliteTransaction,
  type SqliteDatabase,
} from '@electron/services/workspace/workspaceSearchIndexDatabase.js'
import {
  clearSearchRows,
  loadDocumentsForRows,
  loadIndexedDocuments,
  removeSearchDocumentRows,
  removeSearchRowsByPrefix,
  upsertSearchDocumentRows,
  type SearchDocumentRow,
  type WorkspaceSearchDocument,
} from '@electron/services/workspace/workspaceSearchIndexStorage.js'

const MAX_SEARCH_LIMIT = 100
const MAX_FTS_CANDIDATES = 500

export type { WorkspaceSearchDocument }

export class WorkspaceSearchIndex {
  private databasePath: string | null = null
  private database: SqliteDatabase | null = null

  async open(databasePath: string): Promise<void> {
    const normalizedPath = path.resolve(databasePath)
    if (normalizedPath === this.databasePath && this.database) return

    await this.close()
    await fs.mkdir(path.dirname(normalizedPath), { recursive: true })
    this.database = openSearchDatabase(normalizedPath)
    this.databasePath = normalizedPath

    await this.ensureSchema()
  }

  async close(): Promise<void> {
    if (!this.database) return
    this.database.close()
    this.database = null
    this.databasePath = null
  }

  async hasDocuments(): Promise<boolean> {
    const database = this.requireDatabase()
    const result = database.prepare('SELECT COUNT(*) AS count FROM search_documents_fts').get() as {
      count: number
    }
    return result.count > 0
  }

  async rebuild(documents: WorkspaceSearchDocument[]): Promise<void> {
    const database = this.requireDatabase()
    const indexable = documents.filter((document) => isMarkdownPath(document.path))
    runSqliteTransaction(database, () => {
      clearSearchRows(database)
      for (const document of indexable) upsertSearchDocumentRows(database, document)
    })
  }

  async upsertDocument(document: WorkspaceSearchDocument): Promise<void> {
    if (!isMarkdownPath(document.path)) return
    const database = this.requireDatabase()
    runSqliteTransaction(database, () => {
      removeSearchDocumentRows(database, document.path)
      upsertSearchDocumentRows(database, document)
    })
  }

  async removeDocument(pathValue: string): Promise<void> {
    const database = this.requireDatabase()
    runSqliteTransaction(database, () => removeSearchDocumentRows(database, pathValue))
  }

  async removePathPrefix(prefix: string): Promise<void> {
    const database = this.requireDatabase()
    runSqliteTransaction(database, () => removeSearchRowsByPrefix(database, prefix))
  }

  async search(query: string, limit: number): Promise<FsSearchResult[]> {
    const terms = parseSearchTerms(query)
    if (terms.length === 0) return []

    const finalLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_LIMIT)
    const match = buildMatchExpression(terms.map((term) => term.folded))
    if (!match) return this.searchIndexedDocuments(query, finalLimit)

    const statement = this.requireDatabase().prepare(`
      SELECT
        d.id AS document_id,
        d.path AS path,
        d.title AS title,
        bm25(search_documents_fts) AS rank
      FROM search_documents_fts
      JOIN search_documents AS d ON d.id = search_documents_fts.rowid
      WHERE search_documents_fts MATCH @match
      ORDER BY bm25(search_documents_fts, 6.0, 2.4, 1.0, 0.0) ASC
      LIMIT @limit
    `)

    const rows = ((): SearchDocumentRow[] => {
      try {
        return statement.all({
          match,
          limit: Math.min(Math.max(finalLimit * 8, 50), MAX_FTS_CANDIDATES),
        }) as SearchDocumentRow[]
      } catch {
        return []
      }
    })()

    if (rows.length === 0) return this.searchIndexedDocuments(query, finalLimit)
    const documents = loadDocumentsForRows(this.requireDatabase(), rows)
    const results = searchDocuments(documents, query, finalLimit)
    if (results.length > 0) return results
    return this.searchIndexedDocuments(query, finalLimit)
  }

  private async ensureSchema(): Promise<void> {
    await ensureSearchSchema(this.requireDatabase())
  }

  private searchIndexedDocuments(query: string, limit: number): FsSearchResult[] {
    return searchDocuments(loadIndexedDocuments(this.requireDatabase()), query, limit)
  }

  private requireDatabase(): SqliteDatabase {
    if (!this.database) {
      throw new Error('Search index database is not opened.')
    }
    return this.database
  }
}
