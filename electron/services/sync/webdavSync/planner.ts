import type { SyncManifestEntry } from '@electron/services/sync/core/types.js'
import { entriesByPath } from '@electron/services/sync/webdavSync/manifest.js'

export type SyncOperation = {
  kind: 'upload' | 'download' | 'deleteRemote' | 'deleteLocal' | 'conflict' | 'noop' | 'skip'
  path: string
  local?: SyncManifestEntry
  baseline?: SyncManifestEntry
  remote?: SyncManifestEntry
}

type PlanInput = {
  local: SyncManifestEntry[]
  baseline: SyncManifestEntry[]
  remote: SyncManifestEntry[]
  protectedPaths?: ReadonlySet<string>
}

export const planThreeWaySync = (input: PlanInput): { operations: SyncOperation[] } => {
  const local = entriesByPath(input.local)
  const baseline = entriesByPath(input.baseline)
  const remote = entriesByPath(input.remote)
  const paths = [...new Set([...local.keys(), ...baseline.keys(), ...remote.keys()])].sort()
  return {
    operations: paths.map((path) => {
      const values = {
        local: local.get(path),
        baseline: baseline.get(path),
        remote: remote.get(path),
      }
      if (input.protectedPaths?.has(path)) return operation('skip', path, values)
      const localChanged = changedSince(values.local, values.baseline)
      const remoteChanged = changedSince(values.remote, values.baseline)
      if (!localChanged && !remoteChanged) return operation('noop', path, values)
      if (localChanged && !remoteChanged) {
        return operation(values.local ? 'upload' : 'deleteRemote', path, values)
      }
      if (!localChanged && remoteChanged) {
        return operation(isDeleted(values.remote) ? 'deleteLocal' : 'download', path, values)
      }
      if (
        sameState(values.local, values.remote) ||
        (isDeleted(values.local) && isDeleted(values.remote))
      ) {
        return operation('noop', path, values)
      }
      return operation('conflict', path, values)
    }),
  }
}

type EntryState = 'absent' | 'live' | 'tombstone'

const stateOf = (entry: SyncManifestEntry | undefined): EntryState => {
  if (!entry) return 'absent'
  return entry.deletedAt ? 'tombstone' : 'live'
}

const isDeleted = (entry: SyncManifestEntry | undefined): boolean => stateOf(entry) !== 'live'

const changedSince = (
  current: SyncManifestEntry | undefined,
  baseline: SyncManifestEntry | undefined,
): boolean => {
  if (stateOf(baseline) === 'tombstone' && isDeleted(current)) return false
  return !sameState(current, baseline)
}

const sameState = (
  left: SyncManifestEntry | undefined,
  right: SyncManifestEntry | undefined,
): boolean => {
  const leftState = stateOf(left)
  const rightState = stateOf(right)
  if (leftState !== rightState) return false
  if (leftState !== 'live') return true
  return left?.hash === right?.hash
}

const operation = (
  kind: SyncOperation['kind'],
  path: string,
  values: Omit<SyncOperation, 'kind' | 'path'>,
): SyncOperation => ({ kind, path, ...values })
