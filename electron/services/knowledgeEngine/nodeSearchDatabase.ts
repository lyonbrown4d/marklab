import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'
import type { Database as BetterSqliteDatabase } from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'

import { configureSqlitePragmas } from '@electron/database/sqlitePragmas'
import type {
  WorkspaceSearchDocument,
  WorkspaceSearchMutationBatch,
} from '@electron/services/workspace/workspaceSearchTypes'
import {
  foldSearchText,
  isFuzzySearchTerm,
} from '@electron/services/knowledgeEngine/nodeSearchNormalization'
import {
  exactFtsExpression,
  fuzzyFtsExpression,
  matchSearchDocument,
  type NodeSearchCandidate,
} from '@electron/services/knowledgeEngine/nodeSearchQuery'
import {
  normalizeSearchDocument,
  normalizeSearchPath,
} from '@electron/services/knowledgeEngine/nodeSearchIndexSupport'
import type { NodeSearchDatabaseSchema } from '@electron/services/knowledgeEngine/nodeSearchDatabaseTypes'
import {
  NodeSearchDocumentRepository,
  type SearchDocumentWrite,
} from '@electron/services/knowledgeEngine/nodeSearchDocumentRepository'
import { NodeSearchFtsRepository } from '@electron/services/knowledgeEngine/nodeSearchFtsRepository'
import {
  NodeSearchMetadataRepository,
  SEARCH_METADATA_KEYS,
} from '@electron/services/knowledgeEngine/nodeSearchMetadataRepository'
import { migrateNodeSearchDatabase } from '@electron/services/knowledgeEngine/nodeSearchMigrations'

const SEARCH_DATABASE_FILE = 'search.sqlite3'
const BUSY_TIMEOUT_MS = 5_000
const INCOMPLETE_INDEX_UPDATED_AT = ''
const SEARCH_READ_BATCH_SIZE = 128
const OCCURRENCE_READ_BATCH_SIZE = 32

type SearchRow = WorkspaceSearchDocument & { rank: number }

export class NodeSearchDatabase {
  private readonly connection: Kysely<NodeSearchDatabaseSchema>
  private readonly documents: NodeSearchDocumentRepository
  private readonly fts: NodeSearchFtsRepository
  private readonly metadata: NodeSearchMetadataRepository
  private readonly nativeDatabase: BetterSqliteDatabase

  constructor(
    storageDirectory: string | undefined,
    private readonly workspaceIdentity: string,
  ) {
    const databasePath = storageDirectory ? prepareDatabasePath(storageDirectory) : ':memory:'
    this.nativeDatabase = new Database(databasePath, { timeout: BUSY_TIMEOUT_MS })
    configureSqlitePragmas(this.nativeDatabase, {
      busyTimeoutMs: BUSY_TIMEOUT_MS,
      journalMode: databasePath === ':memory:' ? 'memory' : 'wal',
      synchronous: 'normal',
    })
    this.connection = new Kysely<NodeSearchDatabaseSchema>({
      dialect: new SqliteDialect({ database: this.nativeDatabase }),
    })
    this.documents = new NodeSearchDocumentRepository(this.connection)
    this.fts = new NodeSearchFtsRepository(this.connection)
    this.metadata = new NodeSearchMetadataRepository(this.connection)
  }

  async initialize(): Promise<void> {
    await migrateNodeSearchDatabase(this.connection)
    await this.ensureWorkspaceIdentity()
  }

  async count(): Promise<number> {
    return this.documents.count()
  }

  async stats(): Promise<{ indexBytes: number; updatedAt: string | null }> {
    const pageCount = this.nativeDatabase.pragma('page_count', { simple: true }) as number
    const pageSize = this.nativeDatabase.pragma('page_size', { simple: true }) as number
    return {
      indexBytes: pageCount * pageSize,
      updatedAt: await this.metadata.get(SEARCH_METADATA_KEYS.updatedAt),
    }
  }

  async replaceAll(
    documents: WorkspaceSearchDocument[],
    shouldCommit: () => boolean,
  ): Promise<{ committed: boolean; updatedAt: string }> {
    const updatedAt = new Date().toISOString()
    if (!shouldCommit()) return { committed: false, updatedAt }
    await this.metadata.upsert(SEARCH_METADATA_KEYS.updatedAt, INCOMPLETE_INDEX_UPDATED_AT)
    try {
      await this.connection.transaction().execute(async (transaction) => {
        const documentRepository = this.documents.withDatabase(transaction)
        await documentRepository.deleteAll()
        await documentRepository.upsertMany(documents.map(toWrite))
        if (!shouldCommit()) throw new CancelledSearchCommit()
        await this.metadata
          .withDatabase(transaction)
          .upsert(SEARCH_METADATA_KEYS.updatedAt, updatedAt)
      })
      return { committed: true, updatedAt }
    } catch (error) {
      if (error instanceof CancelledSearchCommit) return { committed: false, updatedAt }
      throw error
    }
  }

  async applyBatch(batch: WorkspaceSearchMutationBatch): Promise<string> {
    const updatedAt = new Date().toISOString()
    await this.metadata.upsert(SEARCH_METADATA_KEYS.updatedAt, INCOMPLETE_INDEX_UPDATED_AT)
    const paths = batch.removeDocuments.map(normalizeSearchPath)
    const prefixes = batch.removePrefixes.map(normalizeSearchPath)
    const upserts = batch.upserts.map(normalizeSearchDocument).map(toWrite)
    await this.connection.transaction().execute(async (transaction) => {
      const documents = this.documents.withDatabase(transaction)
      await documents.deleteMany(paths, prefixes)
      await documents.upsertMany(upserts)
      await this.metadata
        .withDatabase(transaction)
        .upsert(SEARCH_METADATA_KEYS.updatedAt, updatedAt)
    })
    return updatedAt
  }

  async *searchBatches(terms: string[]): AsyncGenerator<NodeSearchCandidate[]> {
    const expressions = searchExpressions(terms)
    let candidateCount = 0
    const seenPaths = new Set<string>()
    for (const expression of expressions) {
      for (let offset = 0; ; offset += SEARCH_READ_BATCH_SIZE) {
        const rows = await this.fts.search(expression, SEARCH_READ_BATCH_SIZE, offset)
        const uniqueRows = rows.filter((row) => {
          if (seenPaths.has(row.path)) return false
          seenPaths.add(row.path)
          return true
        })
        candidateCount += uniqueRows.length
        const matches = matchingCandidates(uniqueRows, terms)
        if (matches.length > 0) yield matches
        if (rows.length < SEARCH_READ_BATCH_SIZE) break
      }
    }
    if (candidateCount > 0 || !requiresFullScanFallback(terms)) return
    for (let offset = 0; ; offset += SEARCH_READ_BATCH_SIZE) {
      const rows = (await this.documents.listPage(SEARCH_READ_BATCH_SIZE, offset)).map((row) => ({
        ...row,
        rank: 0,
      }))
      const matches = matchingCandidates(rows, terms)
      if (matches.length > 0) yield matches
      if (rows.length < SEARCH_READ_BATCH_SIZE) break
    }
  }

  async occurrenceDocuments(
    maxDocuments: number,
    maxCharacters: number,
    maxDocumentCharacters: number,
  ): Promise<{ documents: WorkspaceSearchDocument[]; truncated: boolean }> {
    const documents: WorkspaceSearchDocument[] = []
    const totalDocuments = await this.documents.count()
    let characters = 0
    let offset = 0
    let truncated = false

    while (offset < totalDocuments && documents.length < maxDocuments) {
      const rows = await this.documents.listPage(OCCURRENCE_READ_BATCH_SIZE, offset)
      if (rows.length === 0) break
      offset += rows.length
      for (const row of rows) {
        if (row.content.length > maxDocumentCharacters) {
          truncated = true
          continue
        }
        if (characters + row.content.length > maxCharacters) {
          truncated = true
          break
        }
        documents.push({ content: row.content, path: row.path, title: row.title })
        characters += row.content.length
        if (documents.length >= maxDocuments) break
      }
      if (characters >= maxCharacters) break
    }

    return { documents, truncated: truncated || offset < totalDocuments }
  }

  async close(): Promise<void> {
    await this.connection.destroy()
  }

  private async ensureWorkspaceIdentity(): Promise<void> {
    const current = await this.metadata.get(SEARCH_METADATA_KEYS.workspaceIdentity)
    await this.connection.transaction().execute(async (transaction) => {
      const metadata = this.metadata.withDatabase(transaction)
      if (current !== null && current !== this.workspaceIdentity) {
        await this.documents.withDatabase(transaction).deleteAll()
        await metadata.upsert(SEARCH_METADATA_KEYS.updatedAt, INCOMPLETE_INDEX_UPDATED_AT)
      }
      await metadata.upsert(SEARCH_METADATA_KEYS.workspaceIdentity, this.workspaceIdentity)
    })
  }
}

class CancelledSearchCommit extends Error {}

const prepareDatabasePath = (storageDirectory: string): string => {
  const root = path.resolve(storageDirectory)
  fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  return path.join(root, SEARCH_DATABASE_FILE)
}

const toWrite = (document: WorkspaceSearchDocument): SearchDocumentWrite => ({
  content: document.content,
  folded_content: foldSearchText(document.content),
  folded_path: foldSearchText(document.path),
  folded_title: foldSearchText(document.title),
  path: document.path,
  title: document.title,
})

const searchExpressions = (terms: string[]): string[] => {
  const expressions = [
    exactFtsExpression(terms),
    terms.some(isFuzzySearchTerm) ? fuzzyFtsExpression(terms) : null,
  ].filter((value): value is string => value !== null)
  return [...new Set(expressions)]
}

const requiresFullScanFallback = (terms: string[]): boolean =>
  terms.some(isFuzzySearchTerm) || terms.every((term) => [...term].length < 3)

const matchingCandidates = (rows: SearchRow[], terms: string[]): NodeSearchCandidate[] =>
  rows.flatMap((row) => {
    const match = matchSearchDocument(row, terms)
    if (!match.matches) return []
    return [
      {
        content: row.content,
        indexedMatches: match.indexedMatches,
        path: row.path,
        score: Number.isFinite(row.rank) ? Math.max(0, -row.rank) : 0,
        title: row.title,
      },
    ]
  })
