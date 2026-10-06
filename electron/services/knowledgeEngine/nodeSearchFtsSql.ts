import { sql } from 'kysely'

export type NodeSearchFtsRow = {
  content: string
  path: string
  rank: number
  title: string
}

export const createSearchFtsTable = sql`
  CREATE VIRTUAL TABLE search_fts USING fts5(
    folded_title,
    folded_path,
    folded_content,
    content = 'search_documents',
    content_rowid = 'id',
    tokenize = 'trigram'
  )
`

export const createSearchDocumentInsertTrigger = sql`
  CREATE TRIGGER search_documents_ai AFTER INSERT ON search_documents BEGIN
    INSERT INTO search_fts(rowid, folded_title, folded_path, folded_content)
    VALUES (new.id, new.folded_title, new.folded_path, new.folded_content);
  END
`

export const createSearchDocumentDeleteTrigger = sql`
  CREATE TRIGGER search_documents_ad AFTER DELETE ON search_documents BEGIN
    INSERT INTO search_fts(search_fts, rowid, folded_title, folded_path, folded_content)
    VALUES ('delete', old.id, old.folded_title, old.folded_path, old.folded_content);
  END
`

export const createSearchDocumentUpdateTrigger = sql`
  CREATE TRIGGER search_documents_au AFTER UPDATE ON search_documents BEGIN
    INSERT INTO search_fts(search_fts, rowid, folded_title, folded_path, folded_content)
    VALUES ('delete', old.id, old.folded_title, old.folded_path, old.folded_content);
    INSERT INTO search_fts(rowid, folded_title, folded_path, folded_content)
    VALUES (new.id, new.folded_title, new.folded_path, new.folded_content);
  END
`

export const dropSearchDocumentUpdateTrigger = sql`DROP TRIGGER search_documents_au`
export const dropSearchDocumentDeleteTrigger = sql`DROP TRIGGER search_documents_ad`
export const dropSearchDocumentInsertTrigger = sql`DROP TRIGGER search_documents_ai`
export const dropSearchFtsTable = sql`DROP TABLE search_fts`

export const searchFtsCandidates = (
  expression: string,
  limit: number,
  offset: number,
) => sql<NodeSearchFtsRow>`
    SELECT d.path, d.title, d.content, bm25(search_fts, 5.0, 3.0, 1.0) AS rank
    FROM search_fts
    JOIN search_documents AS d ON d.id = search_fts.rowid
    WHERE search_fts MATCH ${expression}
    ORDER BY rank ASC, d.path ASC
    LIMIT ${limit} OFFSET ${offset}
  `
