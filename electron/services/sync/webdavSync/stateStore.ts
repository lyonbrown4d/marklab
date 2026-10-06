import path from 'node:path'

import { z } from 'zod'

import {
  SyncConflictRepository,
  type SyncConflictWrite,
} from '@electron/database/repositories/syncConflictRepository'
import {
  WebDavSyncEntryRepository,
  type WebDavSyncEntryWrite,
} from '@electron/database/repositories/webDavSyncEntryRepository'
import { WebDavSyncStateRepository } from '@electron/database/repositories/webDavSyncStateRepository'
import { WorkspaceRepository } from '@electron/database/repositories/workspaceRepository'
import type { LocalDatabaseService } from '@electron/database/localDatabaseService'
import type {
  LocalSyncState,
  LocalSyncStateStore,
  SyncConflict,
  SyncManifestEntry,
} from '@electron/services/sync/core/types'
import { parseSyncManifest } from '@electron/services/sync/webdavSync/manifest'
import {
  normalizeSyncPath,
  portableSyncPathKey,
} from '@electron/services/sync/webdavSync/pathSafety'
import { canonicalWorkspacePath } from '@electron/services/workspace/workspaceIdentity'

const conflictSchema = z
  .object({
    path: z.string().min(1).max(4_096),
    status: z.literal('unresolved'),
    reason: z.enum(['both_changed', 'delete_vs_change']),
    conflictPath: z.string().min(1).max(4_096).optional(),
    localHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    remoteHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
const stateSchema = z
  .object({
    version: z.literal(1),
    remoteManifestEtag: z.string().min(1).max(2_048).optional(),
    baseline: z.array(z.unknown()).max(1_000_000),
    unresolvedConflicts: z.array(conflictSchema).max(100_000).optional(),
    updatedAt: z.iso.datetime(),
  })
  .strict()

export class FileLocalSyncStateStore implements LocalSyncStateStore {
  private readonly conflicts = new SyncConflictRepository()
  private readonly entries = new WebDavSyncEntryRepository()
  private readonly states = new WebDavSyncStateRepository()
  private readonly workspaces = new WorkspaceRepository()

  constructor(private readonly localDatabase: LocalDatabaseService) {}

  async load(root: string): Promise<LocalSyncState | null> {
    await this.localDatabase.initialize()
    try {
      const canonicalPath = canonicalWorkspaceStateKey(root)
      const snapshot = this.localDatabase.sqlite.transaction(() => {
        const workspace = this.workspaces.findByCanonicalPath(this.localDatabase, canonicalPath)
        if (!workspace) return null
        const state = this.states.get(this.localDatabase, workspace.id)
        if (!state) return null
        const baseline = this.entries.list(this.localDatabase, state.workspace_id)
        const conflicts = state.has_unresolved_conflicts
          ? this.conflicts.list(this.localDatabase, state.workspace_id)
          : []
        return { baseline, conflicts, state }
      })()
      if (!snapshot) return null
      const { baseline: baselineRows, conflicts: conflictRows, state } = snapshot
      const baseline = baselineRows.map(toManifestEntry)
      const conflicts = conflictRows.map(toSyncConflict)
      const persisted = stateSchema.parse({
        version: 1,
        updatedAt: state.updated_at,
        baseline,
        ...(state.remote_manifest_etag ? { remoteManifestEtag: state.remote_manifest_etag } : {}),
        ...(state.has_unresolved_conflicts ? { unresolvedConflicts: conflicts } : {}),
      })
      const validatedBaseline = parseSyncManifest({
        version: 1,
        deviceId: 'local-state',
        updatedAt: persisted.updatedAt,
        entries: persisted.baseline,
      }).entries
      return {
        ...persisted,
        baseline: validatedBaseline,
        ...validatedConflictProperty(persisted.unresolvedConflicts),
      }
    } catch (error) {
      throw new Error('Local sync state is invalid', { cause: error })
    }
  }

  async save(root: string, state: LocalSyncState): Promise<void> {
    const parsed = stateSchema.parse(state)
    const persisted = { ...parsed, ...validatedConflictProperty(parsed.unresolvedConflicts) }
    const baseline = parseSyncManifest({
      version: 1,
      deviceId: 'local-state',
      updatedAt: persisted.updatedAt,
      entries: persisted.baseline,
    }).entries
    await this.localDatabase.initialize()
    this.localDatabase.sqlite.transaction(() => {
      const canonicalPath = canonicalWorkspaceStateKey(root)
      const workspaceId = this.workspaces.findOrCreate(
        this.localDatabase,
        path.resolve(root),
        canonicalPath,
      )
      this.states.upsert(this.localDatabase, {
        workspace_id: workspaceId,
        remote_manifest_etag: persisted.remoteManifestEtag ?? null,
        updated_at: persisted.updatedAt,
        has_unresolved_conflicts: persisted.unresolvedConflicts ? 1 : 0,
      })
      this.entries.replace(this.localDatabase, workspaceId, entryRows(workspaceId, baseline))
      this.conflicts.replace(
        this.localDatabase,
        workspaceId,
        conflictRows(workspaceId, persisted.unresolvedConflicts ?? []),
      )
    })()
  }
}

const entryRows = (workspaceId: number, entries: SyncManifestEntry[]): WebDavSyncEntryWrite[] =>
  entries.map((entry, position) => ({
    workspace_id: workspaceId,
    position,
    path: entry.path,
    hash: entry.hash,
    size: entry.size,
    modified_at: entry.modifiedAt,
    device_id: entry.deviceId,
    storage: entry.storage ?? null,
    etag: entry.etag ?? null,
    deleted_at: entry.deletedAt ?? null,
  }))

const conflictRows = (workspaceId: number, conflicts: SyncConflict[]): SyncConflictWrite[] =>
  conflicts.map((conflict, position) => ({
    workspace_id: workspaceId,
    position,
    path: conflict.path,
    status: conflict.status,
    reason: conflict.reason,
    conflict_path: conflict.conflictPath ?? null,
    local_hash: conflict.localHash ?? null,
    remote_hash: conflict.remoteHash ?? null,
  }))

const toManifestEntry = (row: Awaited<ReturnType<WebDavSyncEntryRepository['list']>>[number]) => ({
  path: row.path,
  hash: row.hash,
  size: row.size,
  modifiedAt: row.modified_at,
  deviceId: row.device_id,
  ...(row.storage ? { storage: row.storage } : {}),
  ...(row.etag ? { etag: row.etag } : {}),
  ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
})

const toSyncConflict = (
  row: Awaited<ReturnType<SyncConflictRepository['list']>>[number],
): SyncConflict => ({
  path: row.path,
  status: row.status,
  reason: row.reason,
  ...(row.conflict_path ? { conflictPath: row.conflict_path } : {}),
  ...(row.local_hash ? { localHash: row.local_hash } : {}),
  ...(row.remote_hash ? { remoteHash: row.remote_hash } : {}),
})

const validatedConflictProperty = (
  conflicts: SyncConflict[] | undefined,
): { unresolvedConflicts?: SyncConflict[] } => {
  if (!conflicts) return {}
  const seen = new Set<string>()
  const normalized = conflicts.map((conflict) => {
    const normalizedPath = normalizeSyncPath(conflict.path)
    const portableKey = portableSyncPathKey(normalizedPath)
    if (seen.has(portableKey)) throw new Error('Duplicate unresolved sync conflict path')
    seen.add(portableKey)
    return {
      ...conflict,
      path: normalizedPath,
      ...(conflict.conflictPath ? { conflictPath: normalizeSyncPath(conflict.conflictPath) } : {}),
    }
  })
  return { unresolvedConflicts: normalized }
}

export const canonicalWorkspaceStateKey = (
  root: string,
  platform: NodeJS.Platform = process.platform,
): string => canonicalWorkspacePath(root, platform)
