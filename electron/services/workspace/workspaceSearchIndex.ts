import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { FsSearchResult } from '@electron/services/workspace/types.js'
import { isMarkdownPath } from '@electron/services/workspace/path.js'
import {
  buildMatchExpression,
  toSearchResult,
  type SearchRow,
} from '@electron/services/workspace/workspaceSearchIndexHelpers.js'
import { parseSearchTerms } from '@electron/services/workspace/markdown/search.js'
import {
  escapeLikePrefix,
  hashText,
  normalizePathPrefix,
} from '@electron/services/workspace/workspaceSearchIndexUtils.js'
import { ensureSearchSchema } from '@electron/services/workspace/workspaceSearchIndexSchema.js'
import Database from 'better-sqlite3'

type SqliteDatabase = InstanceType<typeof Database>

const MAX_SEARCH_LIMIT = 100

export type WorkspaceSearchDocument = {
  path: string
  title: string
  content: string
}

export class WorkspaceSearchIndex {
  private databasePath: string | null = null
  private database: SqliteDatabase | null = null

  async open(databasePath: string): Promise<void> {
    const normalizedPath = path.resolve(databasePath)
    if (normalizedPath === this.databasePath && this.database) return

    await this.close()
    await fs.mkdir(path.dirname(normalizedPath), { recursive: true })
    this.database = new Database(normalizedPath)
    this.database.pragma('journal_mode = WAL')
    this.database.pragma('synchronous = NORMAL')
    this.database.pragma('foreign_keys = ON')
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
    const result = database.prepare('SELECT COUNT(*) AS count FROM search_documents').get() as {
      count: number
    }
    return result.count > 0
  }

  async rebuild(documents: WorkspaceSearchDocument[]): Promise<void> {
    const database = this.requireDatabase()
    const indexable = documents.filter((document) => isMarkdownPath(document.path))
    const insert = database.transaction(() => {
      database.prepare('DELETE FROM search_lines_fts').run()
      database.prepare('DELETE FROM search_lines').run()
      database.prepare('DELETE FROM search_documents').run()
      for (const document of indexable) this.upsertDocumentInTransaction(database, document)
    })
    insert()
  }

  async upsertDocument(document: WorkspaceSearchDocument): Promise<void> {
    if (!isMarkdownPath(document.path)) return
    const database = this.requireDatabase()
    database.transaction(() => {
      this.deleteDocumentRows(database, document.path)
      this.upsertDocumentInTransaction(database, document)
    })()
  }

  async removeDocument(pathValue: string): Promise<void> {
    const database = this.requireDatabase()
    database.transaction(() => this.deleteDocumentRows(database, pathValue))()
  }

  async removePathPrefix(prefix: string): Promise<void> {
    const database = this.requireDatabase()
    const normalizedPrefix = normalizePathPrefix(prefix)
    const likePrefix = `${escapeLikePrefix(normalizedPrefix)}/%`
    const exactPrefix = normalizedPrefix
    database.transaction(() => {
      database
        .prepare(
          `
          DELETE FROM search_lines_fts
          WHERE rowid IN (
            SELECT id
            FROM search_lines
            WHERE path = @exactPrefix OR path LIKE @likePrefix ESCAPE '\\'
          )
        `,
        )
        .run({ exactPrefix, likePrefix })
      database
        .prepare(
          `
          DELETE FROM search_lines
          WHERE path = @exactPrefix OR path LIKE @likePrefix ESCAPE '\\'
        `,
        )
        .run({ exactPrefix, likePrefix })
      database
        .prepare(
          `
          DELETE FROM search_documents
          WHERE path = @exactPrefix OR path LIKE @likePrefix ESCAPE '\\'
        `,
        )
        .run({ exactPrefix, likePrefix })
    })()
  }

  async search(query: string, limit: number): Promise<FsSearchResult[]> {
    const terms = parseSearchTerms(query)
      .map((term) => term.folded)
      .filter((term) => term.length > 0)
    if (terms.length === 0) return []

    const finalLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_LIMIT)
    const match = buildMatchExpression(terms)
    if (!match) return []

    const statement = this.requireDatabase().prepare(`
      SELECT
        l.path AS path,
        l.title AS title,
        l.line_no AS line_no,
        l.line_text AS line_text,
        bm25(search_lines_fts) AS rank
      FROM search_lines_fts
      JOIN search_lines AS l ON l.id = search_lines_fts.rowid
      WHERE search_lines_fts MATCH @match
      ORDER BY bm25(search_lines_fts, 6.0, 2.4, 1.0) ASC
      LIMIT @limit
    `)

    const rows = ((): SearchRow[] => {
      try {
        return statement.all({ match, limit: finalLimit }) as SearchRow[]
      } catch {
        return []
      }
    })()

    return rows.map((row) => toSearchResult(row, terms))
  }

  private async ensureSchema(): Promise<void> {
    ensureSearchSchema(this.requireDatabase())
  }

  private deleteDocumentRows(database: SqliteDatabase, pathValue: string): void {
    database
      .prepare(
        `
        DELETE FROM search_lines_fts
        WHERE rowid IN (
          SELECT id
          FROM search_lines
          WHERE path = @path
        )
      `,
      )
      .run({ path: pathValue })
    database.prepare('DELETE FROM search_lines WHERE path = @path').run({ path: pathValue })
    database.prepare('DELETE FROM search_documents WHERE path = @path').run({ path: pathValue })
  }

  private upsertDocumentInTransaction(
    database: SqliteDatabase,
    document: WorkspaceSearchDocument,
  ): void {
    const now = Date.now()
    const contentHash = hashText(document.content)
    const upsert = database.prepare(`
      INSERT INTO search_documents (path, title, content_hash, updated_ms, size_bytes, indexed_at)
      VALUES (@path, @title, @content_hash, @updated_ms, @size_bytes, @indexed_at)
      ON CONFLICT(path) DO UPDATE SET
        title = excluded.title,
        content_hash = excluded.content_hash,
        updated_ms = excluded.updated_ms,
        size_bytes = excluded.size_bytes,
        indexed_at = excluded.indexed_at
    `)
    upsert.run({
      path: document.path,
      title: document.title,
      content_hash: contentHash,
      updated_ms: now,
      size_bytes: document.content.length,
      indexed_at: now,
    })

    const documentId = Number(
      (
        database.prepare('SELECT id FROM search_documents WHERE path = @path').get({
          path: document.path,
        }) as { id: number } | undefined
      )?.id ?? 0,
    )
    if (!documentId) return

    const insertLine = database.prepare(`
      INSERT INTO search_lines (
        document_id, path, title, line_no, line_text
      ) VALUES (
        @document_id, @path, @title, @line_no, @line_text
      )
    `)
    const insertFts = database.prepare(`
      INSERT INTO search_lines_fts (
        rowid,
        path,
        title,
        body,
        document_id,
        line_no
      ) VALUES (@rowid, @path, @title, @body, @document_id, @line_no)
    `)

    const lines = document.content.split(/\r?\n/)
    for (let lineNumber = 1; lineNumber <= lines.length; lineNumber += 1) {
      const lineText = lines[lineNumber - 1] ?? ''
      const lineResult = insertLine.run({
        document_id: documentId,
        path: document.path,
        title: document.title,
        line_no: lineNumber,
        line_text: lineText,
      })
      if (!lineResult.lastInsertRowid) continue
      insertFts.run({
        rowid: Number(lineResult.lastInsertRowid),
        path: document.path,
        title: document.title,
        body: lineText,
        document_id: documentId,
        line_no: lineNumber,
      })
    }
  }

  private requireDatabase(): SqliteDatabase {
    if (!this.database) {
      throw new Error('Search index database is not opened.')
    }
    return this.database
  }
}
