import path from 'node:path'

import type {
  LocalSyncStateStore,
  RemoteFileStore,
  SyncConflict,
  SyncProgress,
  SyncSkippedFile,
  WorkspaceMutationBoundary,
  WorkspaceSyncResult,
} from '@electron/services/sync/core/types.js'
import { WorkspaceSyncError } from '@electron/services/sync/core/types.js'
import {
  applyPreparedSyncPlan,
  prepareSyncPlan,
  projectRemoteEntries,
} from '@electron/services/sync/webdavSync/executor.js'
import {
  linkSyncAbort,
  normalizeSyncError,
  raceSyncAbort,
  reportSyncProgress,
  workspaceSyncKey,
} from '@electron/services/sync/webdavSync/engineRuntime.js'
import {
  assertCompatibleSyncPaths,
  parseSyncManifest,
} from '@electron/services/sync/webdavSync/manifest.js'
import { scanWorkspace } from '@electron/services/sync/webdavSync/localScanner.js'
import { planThreeWaySync } from '@electron/services/sync/webdavSync/planner.js'
import { scanRemoteStore } from '@electron/services/sync/webdavSync/remoteScanner.js'
import { remoteErrorCode, withRemoteRetry } from '@electron/services/sync/webdavSync/retry.js'
import {
  createSyncManifest,
  reconcileConflicts,
} from '@electron/services/sync/webdavSync/syncState.js'

export type WebDavSyncEngineOptions = {
  deviceId: string
  flushWorkspace: (root: string, reason: string, signal: AbortSignal) => Promise<void>
  invalidateWorkspace: (root: string, changedPaths: string[]) => Promise<void> | void
  mutationBoundary: WorkspaceMutationBoundary
  remote: RemoteFileStore
  stateStore: LocalSyncStateStore
  maxFileSize?: number
  now?: () => Date
}

export type WebDavSyncRunOptions = {
  signal?: AbortSignal
  onProgress?: (progress: SyncProgress) => void
}

const DEFAULT_MAX_FILE_SIZE = 128 * 1024 * 1024
const MAX_MANIFEST_REPLANS = 2

export class WebDavSyncEngine {
  private readonly active = new Map<string, AbortController>()

  constructor(private readonly options: WebDavSyncEngineOptions) {}

  async sync(root: string, options: WebDavSyncRunOptions = {}): Promise<WorkspaceSyncResult> {
    const canonicalRoot = path.resolve(root)
    const key = workspaceSyncKey(canonicalRoot)
    if (this.active.has(key)) throw new WorkspaceSyncError('conflict', 'Sync is active')
    const controller = new AbortController()
    const unlink = linkSyncAbort(options.signal, controller)
    this.active.set(key, controller)
    const changedPaths = new Set<string>()
    let result: WorkspaceSyncResult | undefined
    let failure: Error | undefined
    try {
      result = await this.run(canonicalRoot, controller.signal, options.onProgress, changedPaths)
    } catch (error) {
      failure = normalizeSyncError(error)
    }
    try {
      if (changedPaths.size > 0) {
        options.onProgress?.({ stage: 'invalidating', completed: 0, total: changedPaths.size })
        await this.options.invalidateWorkspace(canonicalRoot, [...changedPaths].sort())
      }
    } catch (error) {
      if (!failure) failure = normalizeSyncError(error)
    } finally {
      unlink()
      if (this.active.get(key) === controller) this.active.delete(key)
    }
    if (failure) throw failure
    return result!
  }

  cancel(root: string): boolean {
    const controller = this.active.get(workspaceSyncKey(path.resolve(root)))
    if (!controller) return false
    controller.abort()
    return true
  }

  private async run(
    root: string,
    signal: AbortSignal,
    onProgress: WebDavSyncRunOptions['onProgress'],
    changedPaths: Set<string>,
  ): Promise<WorkspaceSyncResult> {
    signal.throwIfAborted()
    reportSyncProgress(onProgress, 'flushing')
    await raceSyncAbort(this.options.flushWorkspace(root, 'webdav-sync', signal), signal)
    const state = await this.options.stateStore.load(root)
    const baseline = state?.baseline ?? []
    const totals = { uploaded: 0, downloaded: 0, deleted: 0 }
    const conflicts = new Map<string, SyncConflict>()
    const skipped = new Map<string, SyncSkippedFile>()
    let retries = 0

    for (let replan = 0; replan <= MAX_MANIFEST_REPLANS; replan += 1) {
      signal.throwIfAborted()
      reportSyncProgress(onProgress, 'scanning')
      const local = await scanWorkspace(root, {
        deviceId: this.options.deviceId,
        maxFileSize: this.options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
        signal,
      })
      local.skipped.forEach((entry) => skipped.set(entry.path, entry))
      reportSyncProgress(onProgress, 'reading_remote')
      const snapshot = await withRemoteRetry(() => this.options.remote.readManifest({ signal }), {
        signal,
      })
      if (!snapshot && state) {
        throw new WorkspaceSyncError(
          'precondition_failed',
          'Remote sync manifest is missing for an initialized workspace',
        )
      }
      if (snapshot && !isStrongEtag(snapshot.etag)) {
        throw new WorkspaceSyncError('validation', 'Remote sync manifest requires a strong ETag')
      }
      const metadataExists =
        !snapshot && this.options.remote.hasSyncMetadata
          ? await withRemoteRetry(() => this.options.remote.hasSyncMetadata!({ signal }), {
              signal,
            })
          : false
      if (metadataExists) {
        throw new WorkspaceSyncError(
          'precondition_failed',
          'Remote sync metadata exists but its manifest is missing',
        )
      }
      const remote = snapshot
        ? {
            entries: parseSyncManifest(snapshot.manifest).entries,
            internalMetadataFound: false,
            skipped: [],
          }
        : await withRemoteRetry(
            () =>
              scanRemoteStore(this.options.remote, {
                signal,
                maxFileSize: this.options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
              }),
            { signal },
          )
      if (!snapshot && remote.skipped.length > 0) {
        throw new WorkspaceSyncError(
          'validation',
          'Cannot initialize sync from an incomplete remote scan',
        )
      }
      if (!snapshot && remote.internalMetadataFound) {
        throw new WorkspaceSyncError(
          'precondition_failed',
          'Remote sync metadata exists but its manifest is missing',
        )
      }
      assertCompatibleSyncPaths(
        local.entries,
        local.skipped,
        baseline,
        remote.entries,
        remote.skipped,
      )
      remote.skipped.forEach((entry) => skipped.set(entry.path, entry))
      const remoteEntries = remote.entries.filter(
        (entry) => !entry.path.startsWith('.marklab-sync/'),
      )
      const protectedPaths = new Set([
        ...local.skipped.map(({ path: relativePath }) => relativePath),
        ...remote.skipped.map(({ path: relativePath }) => relativePath),
      ])
      for (const entry of remoteEntries) {
        if (!entry.deletedAt && entry.size > (this.options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE)) {
          const skippedEntry: SyncSkippedFile = {
            path: entry.path,
            reason: 'file_too_large',
            size: entry.size,
          }
          skipped.set(entry.path, skippedEntry)
          protectedPaths.add(entry.path)
        }
      }

      reportSyncProgress(onProgress, 'planning')
      const plan = planThreeWaySync({
        local: local.entries,
        baseline,
        remote: remoteEntries,
        protectedPaths,
      })
      const planDate = this.options.now?.() ?? new Date()
      const executionOptions = {
        baseline,
        deviceId: this.options.deviceId,
        maxFileSize: this.options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
        mutationBoundary: this.options.mutationBoundary,
        now: () => planDate,
        onChangedPath: (relativePath: string) => changedPaths.add(relativePath),
        onProgress,
        operations: plan.operations,
        remote: this.options.remote,
        remoteEntries,
        root,
        signal,
      }
      const projectedManifest = createSyncManifest(
        projectRemoteEntries(executionOptions),
        this.options.deviceId,
        planDate,
      )
      this.options.remote.assertManifestWritable?.(projectedManifest)
      const prepared = await prepareSyncPlan(executionOptions)
      const manifest = createSyncManifest(
        prepared.nextRemoteEntries,
        this.options.deviceId,
        planDate,
      )
      reportSyncProgress(onProgress, 'writing_manifest')
      let manifestCommitted = false
      try {
        const written = await withRemoteRetry(
          () =>
            this.options.remote.writeManifest(manifest, {
              signal,
              ...(snapshot?.etag ? { ifMatch: snapshot.etag } : { ifNoneMatch: '*' as const }),
            }),
          { signal },
        )
        manifestCommitted = true
        const executed = await applyPreparedSyncPlan(executionOptions, prepared)
        executed.changedPaths.forEach((entry) => changedPaths.add(entry))
        const unresolvedConflicts = reconcileConflicts(
          state?.unresolvedConflicts ?? [],
          plan.operations,
          executed.conflicts,
        )
        conflicts.clear()
        unresolvedConflicts.forEach((entry) =>
          conflicts.set(`${entry.path}:${entry.conflictPath ?? ''}`, entry),
        )
        executed.skipped.forEach((entry) => skipped.set(entry.path, entry))
        totals.uploaded += executed.uploaded
        totals.downloaded += executed.downloaded
        totals.deleted += executed.deleted
        await this.options.stateStore.save(root, {
          version: 1,
          baseline: executed.baseline,
          unresolvedConflicts,
          updatedAt: manifest.updatedAt,
          ...(written.etag ? { remoteManifestEtag: written.etag } : {}),
        })
        reportSyncProgress(onProgress, 'completed', 1, 1)
        return {
          changedPaths: [...changedPaths].sort(),
          conflicts: [...conflicts.values()],
          skipped: [...skipped.values()],
          ...totals,
          retries,
        }
      } catch (error) {
        if (
          manifestCommitted ||
          remoteErrorCode(error) !== 'precondition_failed' ||
          replan >= MAX_MANIFEST_REPLANS
        ) {
          throw error
        }
        retries += 1
      }
    }
    throw new WorkspaceSyncError('precondition_failed', 'Remote manifest kept changing')
  }
}

const isStrongEtag = (etag: string | undefined): etag is string => {
  const normalized = etag?.trim()
  return Boolean(normalized && !/^W\//i.test(normalized))
}
