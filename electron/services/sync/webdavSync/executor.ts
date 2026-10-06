import type {
  RemoteFileStore,
  SyncConflict,
  SyncManifestEntry,
  SyncProgress,
  SyncSkippedFile,
  WorkspaceMutationBoundary,
} from '@electron/services/sync/core/types'
import { applyLocalSyncOperations } from '@electron/services/sync/webdavSync/localExecutor'
import { entriesByPath } from '@electron/services/sync/webdavSync/manifest'
import type { SyncOperation } from '@electron/services/sync/webdavSync/planner'
import { ensureRemoteObject } from '@electron/services/sync/webdavSync/remoteObject'
import { createUploadSnapshot } from '@electron/services/sync/webdavSync/uploadSnapshot'

export type ExecuteOptions = {
  baseline: SyncManifestEntry[]
  deviceId: string
  maxFileSize: number
  mutationBoundary: WorkspaceMutationBoundary
  now: () => Date
  onChangedPath?: (path: string) => void
  onProgress?: (progress: SyncProgress) => void
  operations: SyncOperation[]
  remote: RemoteFileStore
  remoteEntries: SyncManifestEntry[]
  root: string
  signal: AbortSignal
}

export type ExecuteResult = {
  baseline: SyncManifestEntry[]
  changedPaths: string[]
  conflicts: SyncConflict[]
  deleted: number
  downloaded: number
  nextRemoteEntries: SyncManifestEntry[]
  skipped: SyncSkippedFile[]
  uploaded: number
}

export const executeSyncPlan = async (options: ExecuteOptions): Promise<ExecuteResult> => {
  return applyPreparedSyncPlan(options, await prepareSyncPlan(options))
}

export const prepareSyncPlan = async (options: ExecuteOptions): Promise<ExecuteResult> => {
  const nextRemote = entriesByPath(options.remoteEntries)
  const nextBaseline = entriesByPath(options.baseline)
  const totals = { uploaded: 0, downloaded: 0, deleted: 0 }
  await executeRemoteOperations(options, nextRemote, nextBaseline, totals)
  return {
    baseline: [...nextBaseline.values()].sort(byPath),
    changedPaths: [],
    conflicts: [],
    nextRemoteEntries: [...nextRemote.values()].sort(byPath),
    skipped: [],
    ...totals,
  }
}

export const projectRemoteEntries = (options: ExecuteOptions): SyncManifestEntry[] => {
  const projected = entriesByPath(options.remoteEntries)
  for (const operation of options.operations) {
    const entry = projectedRemoteEntry(operation, options.deviceId, options.now())
    if (entry) projected.set(operation.path, entry)
  }
  return [...projected.values()].sort(byPath)
}

export const applyPreparedSyncPlan = async (
  options: ExecuteOptions,
  prepared: ExecuteResult,
): Promise<ExecuteResult> => applyLocalSyncOperations(options, prepared)

const executeRemoteOperations = async (
  options: ExecuteOptions,
  nextRemote: Map<string, SyncManifestEntry>,
  nextBaseline: Map<string, SyncManifestEntry>,
  totals: Totals,
): Promise<void> => {
  const operations = options.operations.filter((item) => !isLocalMutation(item))
  for (const operation of operations) {
    options.signal.throwIfAborted()
    if (operation.kind === 'upload' && operation.local) {
      const snapshot = await createUploadSnapshot(options.root, operation.local, options.signal)
      try {
        await ensureRemoteObject(options.remote, operation.local, snapshot, options.signal)
        const uploadedEntry = projectedRemoteEntry(operation, options.deviceId, options.now())!
        nextRemote.set(operation.path, uploadedEntry)
        nextBaseline.set(operation.path, uploadedEntry)
        totals.uploaded += 1
      } finally {
        await snapshot.dispose()
      }
    } else if (operation.kind === 'deleteRemote') {
      const tombstone = projectedRemoteEntry(operation, options.deviceId, options.now())!
      nextRemote.set(operation.path, tombstone)
      nextBaseline.set(operation.path, tombstone)
      totals.deleted += 1
    } else if (operation.kind === 'noop') {
      const settled = operation.remote ?? operation.local
      if (settled) nextBaseline.set(operation.path, settled)
      else nextBaseline.delete(operation.path)
    }
    report(options, operation.path, sum(totals), options.operations.length)
  }
}

const projectedRemoteEntry = (
  operation: SyncOperation,
  deviceId: string,
  now: Date,
): SyncManifestEntry | undefined => {
  if (operation.kind === 'upload' && operation.local) {
    return { ...operation.local, deviceId, storage: 'object' }
  }
  if (operation.kind !== 'deleteRemote') return undefined
  return {
    path: operation.path,
    hash: operation.baseline?.hash ?? operation.remote?.hash ?? '0'.repeat(64),
    size: 0,
    modifiedAt: now.toISOString(),
    deletedAt: now.toISOString(),
    deviceId,
  }
}

const isLocalMutation = (operation: SyncOperation): boolean =>
  operation.kind === 'download' || operation.kind === 'deleteLocal' || operation.kind === 'conflict'

type Totals = { uploaded: number; downloaded: number; deleted: number }
const sum = (totals: Totals): number => totals.uploaded + totals.downloaded + totals.deleted
const report = (
  options: ExecuteOptions,
  relativePath: string,
  completed: number,
  total: number,
): void => options.onProgress?.({ stage: 'applying', completed, total, path: relativePath })
const byPath = (left: SyncManifestEntry, right: SyncManifestEntry): number =>
  left.path.localeCompare(right.path)
