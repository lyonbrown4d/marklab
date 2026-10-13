import type { LocalSyncStateStore, RemoteFileStore } from '@electron/services/sync/core/types'
import { parseSyncManifest } from '@electron/services/sync/webdavSync/manifest'
import {
  applySavedRemoteConflict,
  assertConflictHash,
  preserveLocalConflict,
  readConflictVersion,
} from '@electron/services/sync/webdavSync/conflictFiles'
import type {
  WorkspaceSyncConflictComparison,
  WorkspaceSyncConflictResolution,
} from '@/types/workspaceSync'

export const compareSyncConflict = async (
  root: string,
  relativePath: string,
  stateStore: LocalSyncStateStore,
  signal?: AbortSignal,
): Promise<WorkspaceSyncConflictComparison> => {
  const state = await stateStore.load(root)
  const conflict = state?.unresolvedConflicts?.find((entry) => entry.path === relativePath)
  if (!conflict) throw new Error('Sync conflict no longer exists; refresh the list')
  const local = await readConflictVersion(root, conflict.path, signal)
  const savedRemote = await readConflictVersion(root, conflict.conflictPath, signal)
  if (conflict.conflictPath && savedRemote.hash !== conflict.remoteHash) {
    throw new Error('Saved remote version changed or is missing; sync again before resolving')
  }
  return { conflict, local, savedRemote }
}

export const resolveSyncConflict = async (options: {
  root: string
  request: WorkspaceSyncConflictResolution
  stateStore: LocalSyncStateStore
  remote: RemoteFileStore
  signal: AbortSignal
  assertContext: () => Promise<void>
  onChangedPath?: (relativePath: string) => void
}): Promise<{ ok: true; backupPath?: string }> => {
  const { root, request, stateStore, remote, signal, assertContext } = options
  const comparison = await compareSyncConflict(root, request.path, stateStore, signal)
  const { conflict, local, savedRemote } = comparison
  if (local.hash !== request.expectedLocalHash || savedRemote.hash !== request.expectedRemoteHash) {
    throw new Error('Conflict version changed; review it again')
  }
  const removesVersion =
    request.choice === 'local' ? local.hash === null : savedRemote.hash === null
  if (removesVersion && !request.confirmDelete)
    throw new Error('Confirm the deletion before resolving')
  const snapshot = await remote.readManifest({ signal })
  if (!snapshot?.etag || /^W\//i.test(snapshot.etag))
    throw new Error('Remote manifest is unavailable')
  const remoteEntry = parseSyncManifest(snapshot.manifest).entries.find(
    (entry) => entry.path === request.path,
  )
  const remoteLiveHash = remoteEntry && !remoteEntry.deletedAt ? remoteEntry.hash : null
  if (
    remoteLiveHash !== savedRemote.hash ||
    (remoteEntry?.hash ?? undefined) !== conflict.remoteHash
  ) {
    throw new Error('Remote version changed; sync again before resolving')
  }
  const verify = async () => {
    signal.throwIfAborted()
    await assertContext()
    await assertConflictHash(root, conflict.path, local.hash, signal)
    await assertConflictHash(root, conflict.conflictPath, savedRemote.hash, signal)
    const latest = await remote.readManifest({ signal })
    if (latest?.etag !== snapshot.etag)
      throw new Error('Remote manifest changed; review after syncing again')
    await assertContext()
  }
  await verify()
  let backupPath: string | undefined
  if (request.choice === 'remote' && local.hash !== savedRemote.hash) {
    backupPath = await preserveLocalConflict(root, conflict.path, local, verify, signal)
    if (backupPath) options.onChangedPath?.(backupPath)
    await applySavedRemoteConflict(
      root,
      conflict.path,
      conflict.conflictPath,
      savedRemote,
      verify,
      signal,
    )
    options.onChangedPath?.(conflict.path)
  }
  await assertContext()
  signal.throwIfAborted()
  const state = await stateStore.load(root)
  if (
    !state?.unresolvedConflicts?.some(
      (entry) =>
        entry.path === conflict.path &&
        entry.remoteHash === conflict.remoteHash &&
        entry.conflictPath === conflict.conflictPath,
    )
  ) {
    throw new Error('Conflict state changed; review it again')
  }
  const baseline = state.baseline.filter((entry) => entry.path !== conflict.path)
  if (remoteEntry) baseline.push(remoteEntry)
  await assertContext()
  await assertConflictHash(
    root,
    conflict.path,
    request.choice === 'remote' ? savedRemote.hash : local.hash,
    signal,
  )
  await assertConflictHash(root, conflict.conflictPath, savedRemote.hash, signal)
  if ((await remote.readManifest({ signal }))?.etag !== snapshot.etag)
    throw new Error('Remote manifest changed; review after syncing again')
  await assertContext()
  signal.throwIfAborted()
  await stateStore.save(root, {
    ...state,
    baseline: baseline.sort((left, right) => left.path.localeCompare(right.path)),
    unresolvedConflicts: state.unresolvedConflicts.filter((entry) => entry.path !== conflict.path),
    remoteManifestEtag: snapshot.etag,
    updatedAt: new Date().toISOString(),
  })
  return { ok: true, ...(backupPath ? { backupPath } : {}) }
}
