import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'

const SNAPSHOT_FILE = 'search-index-v1.json'
const BACKUP_FILE = 'search-index-v1.backup.json'

type SearchSnapshot = {
  version: 1
  documents: WorkspaceSearchDocument[]
  metadata: { documentCount: number; updatedAt: string }
}

export class NodeSearchSnapshot {
  private recoveredFromBackup = false

  constructor(private readonly storageDirectory: string) {}

  async load(): Promise<WorkspaceSearchDocument[]> {
    const primaryPath = path.join(this.storageDirectory, SNAPSHOT_FILE)
    const backupPath = path.join(this.storageDirectory, BACKUP_FILE)
    let snapshot: SearchSnapshot | null = null
    let primaryError: unknown
    try {
      snapshot = await readSnapshot(primaryPath)
    } catch (error) {
      primaryError = error
    }
    if (!snapshot) {
      try {
        snapshot = await readSnapshot(backupPath)
        this.recoveredFromBackup = snapshot !== null
      } catch (backupError) {
        throw primaryError ?? backupError
      }
    }
    if (!snapshot && primaryError) throw primaryError
    return snapshot?.documents ?? []
  }

  async write(documents: WorkspaceSearchDocument[]): Promise<void> {
    await fs.mkdir(this.storageDirectory, { recursive: true })
    const primaryPath = path.join(this.storageDirectory, SNAPSHOT_FILE)
    const backupPath = path.join(this.storageDirectory, BACKUP_FILE)
    const temporaryPath = path.join(this.storageDirectory, `.${SNAPSHOT_FILE}.${randomUUID()}.tmp`)
    const snapshot: SearchSnapshot = {
      version: 1,
      documents,
      metadata: { documentCount: documents.length, updatedAt: new Date().toISOString() },
    }
    let committed = false
    const handle = await fs.open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(JSON.stringify(snapshot))
      await handle.sync()
      await handle.close()
      if (this.recoveredFromBackup) {
        await fs.rm(primaryPath, { force: true })
      } else {
        await fs.rm(backupPath, { force: true })
        await renameIfPresent(primaryPath, backupPath)
      }
      await fs.rename(temporaryPath, primaryPath)
      this.recoveredFromBackup = false
      committed = true
    } finally {
      await handle.close().catch(() => undefined)
      if (!committed) await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    }
  }
}

const readSnapshot = async (snapshotPath: string): Promise<SearchSnapshot | null> => {
  let payload: string
  try {
    payload = await fs.readFile(snapshotPath, 'utf8')
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return null
    throw error
  }
  const value: unknown = JSON.parse(payload)
  if (!isSearchSnapshot(value)) throw new Error(`Invalid Node search snapshot: ${snapshotPath}`)
  return value
}

const isSearchSnapshot = (value: unknown): value is SearchSnapshot => {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<SearchSnapshot>
  return (
    snapshot.version === 1 &&
    Array.isArray(snapshot.documents) &&
    snapshot.documents.every(isSearchDocument) &&
    snapshot.metadata?.documentCount === snapshot.documents.length &&
    typeof snapshot.metadata.updatedAt === 'string'
  )
}

const isSearchDocument = (value: unknown): value is WorkspaceSearchDocument => {
  if (!value || typeof value !== 'object') return false
  const document = value as Partial<WorkspaceSearchDocument>
  return (
    typeof document.path === 'string' &&
    typeof document.title === 'string' &&
    typeof document.content === 'string'
  )
}

const renameIfPresent = async (from: string, to: string): Promise<void> => {
  try {
    await fs.rename(from, to)
  } catch (error) {
    if (!isErrorCode(error, 'ENOENT')) throw error
  }
}

const isErrorCode = (error: unknown, code: string): boolean =>
  error instanceof Error && 'code' in error && error.code === code
