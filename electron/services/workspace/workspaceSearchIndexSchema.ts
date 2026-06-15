import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const searchDocumentsTable = sqliteTable('search_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(),
  title: text('title').notNull(),
  contentHash: text('content_hash').notNull(),
  updatedMs: integer('updated_ms').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  indexedAt: integer('indexed_at').notNull(),
})

export const searchLinesTable = sqliteTable('search_lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  documentId: integer('document_id')
    .notNull()
    .references(() => searchDocumentsTable.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  title: text('title').notNull(),
  lineNo: integer('line_no').notNull(),
  lineText: text('line_text').notNull(),
})

export const SEARCH_DOCUMENTS_FTS_TABLE = 'search_documents_fts'
export const SEARCH_LINES_FTS_TABLE = 'search_lines_fts'
