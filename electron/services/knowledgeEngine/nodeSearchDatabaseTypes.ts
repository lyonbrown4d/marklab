import type { Generated, Kysely, Transaction } from 'kysely'

export type SearchDocumentsTable = {
  content: string
  folded_content: string
  folded_path: string
  folded_title: string
  id: Generated<number>
  path: string
  title: string
}

export type SearchMetadataTable = {
  key: string
  value: string
}

export type NodeSearchDatabaseSchema = {
  search_documents: SearchDocumentsTable
  search_metadata: SearchMetadataTable
}

export type NodeSearchConnection =
  Kysely<NodeSearchDatabaseSchema> | Transaction<NodeSearchDatabaseSchema>
