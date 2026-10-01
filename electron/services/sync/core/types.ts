import type { Readable } from 'node:stream'

export type SyncManifestEntry = {
  path: string
  hash: string
  size: number
  modifiedAt: string
  deviceId: string
  storage?: 'object'
  etag?: string
  deletedAt?: string
}

export type SyncManifest = {
  version: 1
  deviceId: string
  updatedAt: string
  entries: SyncManifestEntry[]
}

export type RemoteFileMetadata = {
  path: string
  size: number
  modifiedAt: string
  etag?: string
}

export type RemoteReadResult = RemoteFileMetadata & { body: Readable }
export type RemoteWriteCondition = { etag?: string; ifMatch?: string; ifNoneMatch?: '*' }
export type RemoteManifestSnapshot = { manifest: unknown; etag?: string }

export interface RemoteFileStore {
  assertManifestWritable?(manifest: SyncManifest): void
  hasSyncMetadata?(options: { signal: AbortSignal }): Promise<boolean>
  list(options: { signal: AbortSignal }): AsyncIterable<RemoteFileMetadata>
  read(path: string, options: { signal: AbortSignal }): Promise<RemoteReadResult>
  write(
    path: string,
    body: Readable,
    options: RemoteWriteCondition & { signal: AbortSignal; size: number },
  ): Promise<{ etag?: string }>
  delete(
    path: string,
    options: Pick<RemoteWriteCondition, 'ifMatch'> & { signal: AbortSignal },
  ): Promise<void>
  move(
    from: string,
    to: string,
    options: Pick<RemoteWriteCondition, 'ifMatch' | 'ifNoneMatch'> & { signal: AbortSignal },
  ): Promise<{ etag?: string }>
  readManifest(options: { signal: AbortSignal }): Promise<RemoteManifestSnapshot | null>
  writeManifest(
    manifest: SyncManifest,
    options: Pick<RemoteWriteCondition, 'ifMatch' | 'ifNoneMatch'> & { signal: AbortSignal },
  ): Promise<{ etag?: string }>
}

export type LocalSyncState = {
  version: 1
  remoteManifestEtag?: string
  baseline: SyncManifestEntry[]
  unresolvedConflicts?: SyncConflict[]
  updatedAt: string
}

export interface LocalSyncStateStore {
  load(root: string): Promise<LocalSyncState | null>
  save(root: string, state: LocalSyncState): Promise<void>
}

export type SyncStage =
  | 'flushing'
  | 'scanning'
  | 'reading_remote'
  | 'planning'
  | 'applying'
  | 'writing_manifest'
  | 'invalidating'
  | 'completed'

export type SyncProgress = {
  stage: SyncStage
  completed: number
  total: number
  path?: string
}

export type SyncConflict = {
  path: string
  status: 'unresolved'
  reason: 'both_changed' | 'delete_vs_change'
  conflictPath?: string
  localHash?: string
  remoteHash?: string
}

export type SyncSkippedFile = { path: string; reason: 'file_too_large'; size: number }

export type WorkspaceSyncResult = {
  changedPaths: string[]
  conflicts: SyncConflict[]
  skipped: SyncSkippedFile[]
  uploaded: number
  downloaded: number
  deleted: number
  retries: number
}

export type SyncErrorCode =
  | 'aborted'
  | 'conflict'
  | 'unauthorized'
  | 'validation'
  | 'precondition_failed'
  | 'network'
  | 'local_io'
  | 'remote_io'

export class WorkspaceSyncError extends Error {
  constructor(
    readonly code: SyncErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'WorkspaceSyncError'
  }
}

export type WorkspaceMutationBoundary = <T>(options: {
  root: string
  relativePaths: string[]
  work: () => Promise<T>
}) => Promise<T>
