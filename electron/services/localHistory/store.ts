import type { LocalHistoryDatabase } from '@electron/services/localHistory/database'
import { HistoryDocumentRepository } from '@electron/services/localHistory/documentRepository'
import { HistoryEntryRepository } from '@electron/services/localHistory/entryRepository'
import type {
  LocalHistorySnapshot,
  LocalHistoryWorkspace,
} from '@electron/services/localHistory/types'

export type LocalHistoryDocumentIdentity = {
  workspaceKind: LocalHistoryWorkspace['kind']
  workspacePath: string
  filePath: string
}

export class LocalHistoryStore {
  private readonly documents = new HistoryDocumentRepository()
  private readonly entries = new HistoryEntryRepository()

  constructor(private readonly database: LocalHistoryDatabase) {}

  async capture(
    identity: LocalHistoryDocumentIdentity,
    snapshot: LocalHistorySnapshot,
    createdAtMs: number,
    mergeWindowMs: number,
    maxEntries: number,
  ): Promise<'created' | 'duplicate' | 'merged'> {
    await this.database.ready
    return this.database.connection.transaction().execute(async (transaction) => {
      const documentId = await this.documents.findOrCreate(transaction, identity)
      const latest = await this.entries.latest(transaction, documentId)
      if (latest?.content_hash === snapshot.content_hash) return 'duplicate'

      await this.entries.insert(transaction, documentId, snapshot, createdAtMs)
      const shouldMerge = latest
        ? isInsideMergeWindow(latest.created_at_ms, createdAtMs, mergeWindowMs)
        : false
      if (shouldMerge && latest) await this.entries.remove(transaction, documentId, latest.id)
      await this.entries.prune(transaction, documentId, maxEntries)
      return shouldMerge ? 'merged' : 'created'
    })
  }

  async list(identity: LocalHistoryDocumentIdentity): Promise<LocalHistorySnapshot[]> {
    await this.database.ready
    const document = await this.documents.find(this.database.connection, identity)
    return document
      ? this.entries.list(this.database.connection, document.id, identity.filePath)
      : []
  }

  async read(
    identity: LocalHistoryDocumentIdentity,
    entryId: string,
  ): Promise<LocalHistorySnapshot | null> {
    await this.database.ready
    const document = await this.documents.find(this.database.connection, identity)
    if (!document) return null
    return (
      (await this.entries.get(this.database.connection, document.id, entryId, identity.filePath)) ??
      null
    )
  }

  async delete(identity: LocalHistoryDocumentIdentity, entryId: string): Promise<boolean> {
    await this.database.ready
    const document = await this.documents.find(this.database.connection, identity)
    if (!document) return false
    return this.entries.remove(this.database.connection, document.id, entryId)
  }

  async clear(identity: LocalHistoryDocumentIdentity): Promise<number> {
    await this.database.ready
    return this.database.connection.transaction().execute(async (transaction) => {
      const document = await this.documents.find(transaction, identity)
      if (!document) return 0
      const count = await this.entries.count(transaction, document.id)
      await this.documents.remove(transaction, document.id)
      return count
    })
  }
}

const isInsideMergeWindow = (
  latestAtMs: number,
  createdAtMs: number,
  windowMs: number,
): boolean => {
  const elapsed = createdAtMs - latestAtMs
  return elapsed >= 0 && elapsed <= windowMs
}
