import type {
  SyncConflict,
  SyncManifest,
  SyncManifestEntry,
} from '@electron/services/sync/core/types'
import type { SyncOperation } from '@electron/services/sync/webdavSync/planner'
import { parseSyncManifest } from '@electron/services/sync/webdavSync/manifest'

export const createSyncManifest = (
  entries: SyncManifestEntry[],
  deviceId: string,
  date = new Date(),
): SyncManifest =>
  parseSyncManifest({ version: 1, deviceId, updatedAt: date.toISOString(), entries })

export const reconcileConflicts = (
  previous: SyncConflict[],
  operations: SyncOperation[],
  current: SyncConflict[],
): SyncConflict[] => {
  const unresolved = new Map(current.map((entry) => [entry.path, entry]))
  const operationsByPath = new Map(operations.map((operation) => [operation.path, operation]))
  for (const conflict of previous) {
    if (!unresolved.has(conflict.path) && operationsByPath.get(conflict.path)?.kind === 'skip') {
      unresolved.set(conflict.path, conflict)
    }
  }
  return [...unresolved.values()].sort((left, right) => left.path.localeCompare(right.path))
}
