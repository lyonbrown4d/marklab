import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import {
  NODE_SEARCH_SCHEMA_VERSION,
  NODE_SEARCH_SNAPSHOT_OPTIONS,
} from '@electron/services/knowledgeEngine/nodeSearchConfig.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'

const SNAPSHOT_FILE = 'search-index-v2.json'
const BACKUP_FILE = 'search-index-v2.backup.json'
const LEGACY_FILE = 'search-index-v1.json'

type SourceManifest = {
  digest: string
  documentCount: number
  entries: Array<{ path: string; hash: string }>
}

type SearchSnapshotEnvelope = {
  schemaVersion: typeof NODE_SEARCH_SCHEMA_VERSION
  engine: 'minisearch'
  options: typeof NODE_SEARCH_SNAPSHOT_OPTIONS
  workspace: { identity: string }
  source: SourceManifest
  documents: WorkspaceSearchDocument[]
  index: unknown
  metadata: { updatedAt: string }
}

type LegacySearchSnapshot = {
  version: 1
  documents: WorkspaceSearchDocument[]
  metadata: { documentCount: number; updatedAt: string }
}

export type NodeSearchSnapshotLoadResult = {
  documents: WorkspaceSearchDocument[]
  serializedIndex?: unknown
  requiresRebuild: boolean
}

export class NodeSearchSnapshot {
  private recoveredFromBackup = false

  constructor(
    private readonly storageDirectory: string,
    private readonly workspaceIdentity = '',
  ) {}

  async load(): Promise<NodeSearchSnapshotLoadResult> {
    const primaryPath = path.join(this.storageDirectory, SNAPSHOT_FILE)
    const backupPath = path.join(this.storageDirectory, BACKUP_FILE)
    let snapshot: SearchSnapshotEnvelope | null = null
    let primaryError: unknown
    try {
      snapshot = await readEnvelope(primaryPath)
    } catch (error) {
      primaryError = error
    }
    if (!snapshot) {
      try {
        snapshot = await readEnvelope(backupPath)
        this.recoveredFromBackup = snapshot !== null
      } catch (backupError) {
        primaryError ??= backupError
      }
    }
    if (snapshot) {
      if (snapshot.workspace.identity !== this.workspaceIdentity) {
        return { documents: [], requiresRebuild: true }
      }
      return {
        documents: snapshot.documents,
        serializedIndex: snapshot.index,
        requiresRebuild: false,
      }
    }

    const legacy = await readLegacySnapshot(path.join(this.storageDirectory, LEGACY_FILE))
    if (legacy) return { documents: legacy.documents, requiresRebuild: true }
    if (primaryError) throw primaryError
    return { documents: [], requiresRebuild: false }
  }

  async write(documents: WorkspaceSearchDocument[], serializedIndex: unknown): Promise<void> {
    await fs.mkdir(this.storageDirectory, { recursive: true })
    const primaryPath = path.join(this.storageDirectory, SNAPSHOT_FILE)
    const backupPath = path.join(this.storageDirectory, BACKUP_FILE)
    const temporaryPath = path.join(this.storageDirectory, `.${SNAPSHOT_FILE}.${randomUUID()}.tmp`)
    const snapshot: SearchSnapshotEnvelope = {
      schemaVersion: NODE_SEARCH_SCHEMA_VERSION,
      engine: 'minisearch',
      options: NODE_SEARCH_SNAPSHOT_OPTIONS,
      workspace: { identity: this.workspaceIdentity },
      source: sourceManifest(documents),
      documents,
      index: serializedIndex,
      metadata: { updatedAt: new Date().toISOString() },
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

const readEnvelope = async (snapshotPath: string): Promise<SearchSnapshotEnvelope | null> => {
  const value = await readJson(snapshotPath)
  if (value === null) return null
  if (!isSearchSnapshotEnvelope(value)) {
    throw new Error(`Invalid Node search snapshot: ${snapshotPath}`)
  }
  return value
}

const readLegacySnapshot = async (snapshotPath: string): Promise<LegacySearchSnapshot | null> => {
  const value = await readJson(snapshotPath)
  if (value === null) return null
  if (!isLegacySearchSnapshot(value)) {
    throw new Error(`Invalid legacy Node search snapshot: ${snapshotPath}`)
  }
  return value
}

const readJson = async (snapshotPath: string): Promise<unknown | null> => {
  try {
    return JSON.parse(await fs.readFile(snapshotPath, 'utf8')) as unknown
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return null
    throw error
  }
}

const isSearchSnapshotEnvelope = (value: unknown): value is SearchSnapshotEnvelope => {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<SearchSnapshotEnvelope>
  if (
    snapshot.schemaVersion !== NODE_SEARCH_SCHEMA_VERSION ||
    snapshot.engine !== 'minisearch' ||
    JSON.stringify(snapshot.options) !== JSON.stringify(NODE_SEARCH_SNAPSHOT_OPTIONS) ||
    typeof snapshot.workspace?.identity !== 'string' ||
    !Array.isArray(snapshot.documents) ||
    !snapshot.documents.every(isSearchDocument) ||
    !snapshot.index ||
    typeof snapshot.index !== 'object' ||
    typeof snapshot.metadata?.updatedAt !== 'string' ||
    !isSourceManifest(snapshot.source)
  ) {
    return false
  }
  return manifestsEqual(snapshot.source, sourceManifest(snapshot.documents))
}

const isLegacySearchSnapshot = (value: unknown): value is LegacySearchSnapshot => {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<LegacySearchSnapshot>
  return (
    snapshot.version === 1 &&
    Array.isArray(snapshot.documents) &&
    snapshot.documents.every(isSearchDocument) &&
    snapshot.metadata?.documentCount === snapshot.documents.length &&
    typeof snapshot.metadata.updatedAt === 'string'
  )
}

const isSourceManifest = (value: unknown): value is SourceManifest => {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Partial<SourceManifest>
  return (
    typeof manifest.digest === 'string' &&
    typeof manifest.documentCount === 'number' &&
    Array.isArray(manifest.entries) &&
    manifest.entries.every(
      (entry) =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof entry.path === 'string' &&
        typeof entry.hash === 'string',
    )
  )
}

const sourceManifest = (documents: WorkspaceSearchDocument[]): SourceManifest => {
  const entries = documents
    .map((document) => ({
      path: document.path,
      hash: sha256(`${document.title}\0${document.content}`),
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
  return {
    digest: sha256(entries.map((entry) => `${entry.path}\0${entry.hash}`).join('\n')),
    documentCount: entries.length,
    entries,
  }
}

const manifestsEqual = (left: SourceManifest, right: SourceManifest): boolean =>
  left.documentCount === right.documentCount &&
  left.digest === right.digest &&
  JSON.stringify(left.entries) === JSON.stringify(right.entries)

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

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
