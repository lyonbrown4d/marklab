import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'

import type {
  SyncConflict,
  SyncManifestEntry,
  SyncSkippedFile,
} from '@electron/services/sync/core/types'
import { WorkspaceSyncError } from '@electron/services/sync/core/types'
import { writeDownloadAtomically } from '@electron/services/sync/webdavSync/atomicDownload'
import { availableConflictPath } from '@electron/services/sync/webdavSync/conflictPath'
import type { ExecuteOptions, ExecuteResult } from '@electron/services/sync/webdavSync/executor'
import { entriesByPath } from '@electron/services/sync/webdavSync/manifest'
import type { SyncOperation } from '@electron/services/sync/webdavSync/planner'
import {
  assertWorkspaceRealPathContained,
  resolveSafeWorkspaceTarget,
} from '@electron/services/sync/webdavSync/pathSafety'
import { remoteContentPath } from '@electron/services/sync/webdavSync/remoteObject'
import { withRemoteRetry } from '@electron/services/sync/webdavSync/retry'

type ConflictTarget = { path: string; existing: boolean }
type Totals = { uploaded: number; downloaded: number; deleted: number }

export const applyLocalSyncOperations = async (
  options: ExecuteOptions,
  prepared: ExecuteResult,
): Promise<ExecuteResult> => {
  const nextBaseline = entriesByPath(prepared.baseline)
  const conflicts: SyncConflict[] = []
  const changedPaths: string[] = []
  const skipped: SyncSkippedFile[] = []
  const totals = {
    uploaded: prepared.uploaded,
    downloaded: prepared.downloaded,
    deleted: prepared.deleted,
  }
  const operations = options.operations.filter(needsLocalMutation)
  const targets = await prepareConflictTargets(options, operations, skipped)
  if (operations.length > 0) {
    await options.mutationBoundary({
      root: options.root,
      relativePaths: [
        ...operations.map(({ path }) => path),
        ...[...targets.values()].map(({ path }) => path),
      ],
      work: async () => {
        for (const operation of operations) {
          await applyOperation(
            options,
            operation,
            targets,
            nextBaseline,
            conflicts,
            changedPaths,
            skipped,
            totals,
          )
        }
      },
    })
  }
  return {
    ...prepared,
    baseline: [...nextBaseline.values()].sort(byPath),
    changedPaths,
    conflicts,
    skipped,
    ...totals,
  }
}

const prepareConflictTargets = async (
  options: ExecuteOptions,
  operations: SyncOperation[],
  skipped: SyncSkippedFile[],
): Promise<Map<string, ConflictTarget>> => {
  const targets = new Map<string, ConflictTarget>()
  for (const operation of operations) {
    if (operation.kind !== 'conflict' || !operation.remote || operation.remote.deletedAt) continue
    if (skipOversized(operation.remote, options.maxFileSize, skipped)) continue
    targets.set(
      operation.path,
      await availableConflictPath(options.root, operation.remote, options.signal),
    )
  }
  return targets
}

const applyOperation = async (
  options: ExecuteOptions,
  operation: SyncOperation,
  targets: Map<string, ConflictTarget>,
  nextBaseline: Map<string, SyncManifestEntry>,
  conflicts: SyncConflict[],
  changedPaths: string[],
  skipped: SyncSkippedFile[],
  totals: Totals,
): Promise<void> => {
  options.signal.throwIfAborted()
  if (operation.kind === 'download' && operation.remote) {
    if (skipOversized(operation.remote, options.maxFileSize, skipped)) return
    await downloadEntry(options, operation.remote, operation.path, true, {
      expected: operation.local,
    })
    nextBaseline.set(operation.path, operation.remote)
    recordChangedPath(options, changedPaths, operation.path)
    totals.downloaded += 1
  } else if (operation.kind === 'deleteLocal') {
    const target = await assertLocalPrecondition(options, operation.path, operation.local)
    await fs.rm(target, { force: true })
    await assertWorkspaceRealPathContained(options.root, target)
    if (operation.remote) nextBaseline.set(operation.path, operation.remote)
    recordChangedPath(options, changedPaths, operation.path)
    totals.deleted += 1
  } else if (operation.kind === 'conflict') {
    const created = await createConflict(options, operation, targets.get(operation.path))
    conflicts.push(created.conflict)
    if (created.changedPath) recordChangedPath(options, changedPaths, created.changedPath)
  }
  options.onProgress?.({
    stage: 'applying',
    completed: totals.uploaded + totals.downloaded + totals.deleted,
    total: options.operations.length,
    path: operation.path,
  })
}

const downloadEntry = async (
  options: ExecuteOptions,
  entry: SyncManifestEntry,
  targetPath: string,
  overwrite: boolean,
  precondition?: { expected: SyncManifestEntry | undefined },
): Promise<void> => {
  const target = await resolveSafeWorkspaceTarget(options.root, targetPath)
  await assertWorkspaceRealPathContained(options.root, target)
  await withRemoteRetry(
    async () => {
      const file = await options.remote.read(remoteContentPath(entry), { signal: options.signal })
      await writeDownloadAtomically({
        root: options.root,
        relativePath: targetPath,
        source: file.body,
        expectedHash: entry.hash,
        expectedSize: entry.size,
        overwrite,
        signal: options.signal,
        ...(precondition
          ? {
              beforePublish: () =>
                assertLocalPrecondition(options, targetPath, precondition.expected).then(
                  () => undefined,
                ),
            }
          : {}),
      })
    },
    { signal: options.signal },
  )
  await assertWorkspaceRealPathContained(options.root, target)
}

const createConflict = async (
  options: ExecuteOptions,
  operation: SyncOperation,
  target: ConflictTarget | undefined,
): Promise<{ conflict: SyncConflict; changedPath?: string }> => {
  const result = conflict(operation, conflictReason(operation))
  if (!operation.remote || operation.remote.deletedAt || !target) return { conflict: result }
  if (!target.existing) await downloadEntry(options, operation.remote, target.path, false)
  return {
    conflict: { ...result, conflictPath: target.path },
    ...(target.existing ? {} : { changedPath: target.path }),
  }
}

const conflictReason = (operation: SyncOperation): SyncConflict['reason'] =>
  Boolean(operation.local?.deletedAt) !== Boolean(operation.remote?.deletedAt) ||
  !operation.local ||
  !operation.remote
    ? 'delete_vs_change'
    : 'both_changed'

const conflict = (operation: SyncOperation, reason: SyncConflict['reason']): SyncConflict => ({
  path: operation.path,
  status: 'unresolved',
  reason,
  ...(operation.local?.hash ? { localHash: operation.local.hash } : {}),
  ...(operation.remote?.hash ? { remoteHash: operation.remote.hash } : {}),
})

const needsLocalMutation = (operation: SyncOperation): boolean =>
  operation.kind === 'download' || operation.kind === 'deleteLocal' || operation.kind === 'conflict'

const recordChangedPath = (
  options: ExecuteOptions,
  changedPaths: string[],
  relativePath: string,
): void => {
  changedPaths.push(relativePath)
  options.onChangedPath?.(relativePath)
}

const assertLocalPrecondition = async (
  options: ExecuteOptions,
  relativePath: string,
  expected: SyncManifestEntry | undefined,
): Promise<string> => {
  const target = await resolveSafeWorkspaceTarget(options.root, relativePath)
  const before = await localStats(target)
  if (!expected) {
    if (before) throw localChangedConflict(relativePath)
    return target
  }
  if (!before?.isFile() || before.isSymbolicLink() || before.size !== expected.size) {
    throw localChangedConflict(relativePath)
  }
  let hash: string
  try {
    hash = await hashLocalFile(target, options.signal)
  } catch (error) {
    if (isMissing(error)) throw localChangedConflict(relativePath)
    throw error
  }
  const after = await localStats(target)
  if (!after?.isFile() || !sameFile(before, after) || hash !== expected.hash) {
    throw localChangedConflict(relativePath)
  }
  await assertWorkspaceRealPathContained(options.root, target)
  return target
}

const localStats = async (target: string) =>
  fs.lstat(target).catch((error: unknown) => {
    if (isMissing(error)) return null
    throw error
  })

const hashLocalFile = async (target: string, signal: AbortSignal): Promise<string> => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(target, { signal })) hash.update(chunk)
  return hash.digest('hex')
}

const sameFile = (
  left: Awaited<ReturnType<typeof fs.lstat>>,
  right: Awaited<ReturnType<typeof fs.lstat>>,
): boolean =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mtimeMs === right.mtimeMs

const localChangedConflict = (relativePath: string): WorkspaceSyncError =>
  new WorkspaceSyncError('conflict', `Local file changed while applying sync: ${relativePath}`)

const isMissing = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR'),
  )

const skipOversized = (
  entry: SyncManifestEntry,
  maxFileSize: number,
  skipped: SyncSkippedFile[],
): boolean => {
  if (entry.size <= maxFileSize) return false
  if (!skipped.some(({ path }) => path === entry.path)) {
    skipped.push({ path: entry.path, reason: 'file_too_large', size: entry.size })
  }
  return true
}

const byPath = (left: SyncManifestEntry, right: SyncManifestEntry): number =>
  left.path.localeCompare(right.path)
