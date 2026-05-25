import { foldSearchText } from '@electron/services/workspace/markdown/search.js'
import {
  escapeLikePrefix,
  hashText,
  normalizePathPrefix,
} from '@electron/services/workspace/workspaceSearchIndexUtils.js'
import type { SqliteDatabase } from '@electron/services/workspace/workspaceSearchIndexDatabase.js'

export type WorkspaceSearchDocument = {
  path: string
  title: string
  content: string
}

export type SearchDocumentRow = {
  document_id: number
  path: string
  title: string
  rank: number
}

type SearchLineRow = {
  line_no: number
  line_text: string
}

export const clearSearchRows = (database: SqliteDatabase): void => {
  database.prepare('DELETE FROM search_documents_fts').run()
  database.prepare('DELETE FROM search_lines_fts').run()
  database.prepare('DELETE FROM search_lines').run()
  database.prepare('DELETE FROM search_documents').run()
}

export const removeSearchDocumentRows = (database: SqliteDatabase, pathValue: string): void => {
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
  database
    .prepare(
      `
        DELETE FROM search_documents_fts
        WHERE rowid IN (
          SELECT id
          FROM search_documents
          WHERE path = @path
        )
      `,
    )
    .run({ path: pathValue })
  database.prepare('DELETE FROM search_lines WHERE path = @path').run({ path: pathValue })
  database.prepare('DELETE FROM search_documents WHERE path = @path').run({ path: pathValue })
}

export const removeSearchRowsByPrefix = (database: SqliteDatabase, prefix: string): void => {
  const normalizedPrefix = normalizePathPrefix(prefix)
  const likePrefix = `${escapeLikePrefix(normalizedPrefix)}/%`
  const exactPrefix = normalizedPrefix
  deleteRowsByPrefix(database, 'search_lines_fts', 'search_lines', exactPrefix, likePrefix)
  deleteRowsByPrefix(database, 'search_documents_fts', 'search_documents', exactPrefix, likePrefix)
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
}

export const upsertSearchDocumentRows = (
  database: SqliteDatabase,
  document: WorkspaceSearchDocument,
): void => {
  const now = Date.now()
  const contentHash = hashText(document.content)
  database
    .prepare(
      `
        INSERT INTO search_documents (path, title, content_hash, updated_ms, size_bytes, indexed_at)
        VALUES (@path, @title, @content_hash, @updated_ms, @size_bytes, @indexed_at)
        ON CONFLICT(path) DO UPDATE SET
          title = excluded.title,
          content_hash = excluded.content_hash,
          updated_ms = excluded.updated_ms,
          size_bytes = excluded.size_bytes,
          indexed_at = excluded.indexed_at
      `,
    )
    .run({
      path: document.path,
      title: document.title,
      content_hash: contentHash,
      updated_ms: now,
      size_bytes: document.content.length,
      indexed_at: now,
    })

  const documentId = readDocumentId(database, document.path)
  if (!documentId) return

  insertDocumentFts(database, documentId, document)
  insertDocumentLines(database, documentId, document)
}

export const loadDocumentsForRows = (
  database: SqliteDatabase,
  rows: SearchDocumentRow[],
): WorkspaceSearchDocument[] => {
  const documents: WorkspaceSearchDocument[] = []
  const seen = new Set<number>()
  for (const row of rows) {
    if (seen.has(row.document_id)) continue
    seen.add(row.document_id)
    const lines = loadDocumentLines(database, row.document_id)
    documents.push({
      path: row.path,
      title: row.title,
      content: lines.map((line) => line.line_text).join('\n'),
    })
  }
  return documents
}

export const loadIndexedDocuments = (database: SqliteDatabase): WorkspaceSearchDocument[] => {
  const rows = database
    .prepare(
      `
        SELECT id AS document_id, path, title, 0 AS rank
        FROM search_documents
        ORDER BY path ASC
      `,
    )
    .all() as SearchDocumentRow[]
  return loadDocumentsForRows(database, rows)
}

const deleteRowsByPrefix = (
  database: SqliteDatabase,
  ftsTable: string,
  sourceTable: string,
  exactPrefix: string,
  likePrefix: string,
): void => {
  database
    .prepare(
      `
        DELETE FROM ${ftsTable}
        WHERE rowid IN (
          SELECT id
          FROM ${sourceTable}
          WHERE path = @exactPrefix OR path LIKE @likePrefix ESCAPE '\\'
        )
      `,
    )
    .run({ exactPrefix, likePrefix })
}

const readDocumentId = (database: SqliteDatabase, pathValue: string): number => {
  const row = database.prepare('SELECT id FROM search_documents WHERE path = @path').get({
    path: pathValue,
  }) as { id: number } | undefined
  return Number(row?.id ?? 0)
}

const insertDocumentFts = (
  database: SqliteDatabase,
  documentId: number,
  document: WorkspaceSearchDocument,
): void => {
  database
    .prepare(
      `
        INSERT INTO search_documents_fts (
          rowid,
          path,
          title,
          body,
          document_id
        ) VALUES (@rowid, @path, @title, @body, @document_id)
      `,
    )
    .run({
      rowid: documentId,
      path: foldSearchText(document.path),
      title: foldSearchText(document.title),
      body: foldSearchText(document.content),
      document_id: documentId,
    })
}

const insertDocumentLines = (
  database: SqliteDatabase,
  documentId: number,
  document: WorkspaceSearchDocument,
): void => {
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
      path: foldSearchText(document.path),
      title: foldSearchText(document.title),
      body: foldSearchText(lineText),
      document_id: documentId,
      line_no: lineNumber,
    })
  }
}

const loadDocumentLines = (database: SqliteDatabase, documentId: number): SearchLineRow[] => {
  return database
    .prepare(
      `
        SELECT line_no, line_text
        FROM search_lines
        WHERE document_id = @documentId
        ORDER BY line_no ASC
      `,
    )
    .all({ documentId }) as SearchLineRow[]
}
