import path from 'node:path'
import {
  compareSyncConflict,
  resolveSyncConflict,
} from '@electron/services/sync/webdavSync/conflictResolution'
import type {
  WorkspaceSyncConflictRequest,
  WorkspaceSyncConflictResolution,
} from '@/types/workspaceSync'

import type {
  LocalSyncStateStore,
  RemoteFileStore,
  SyncProgress,
  WorkspaceSyncResult,
} from '@electron/services/sync/core/types'
import { WorkspaceSyncCoordinator } from '@electron/services/sync/core/coordinator'
import {
  createWebDavRemoteClient,
  createWebDavRemoteFileStore,
} from '@electron/services/sync/webdav/index'
import type {
  WebDavConnectionResult,
  WebDavProfile,
  WebDavProfileStoreContract,
  WebDavRemoteClient,
} from '@electron/services/sync/webdav/types'
import {
  WebDavSyncEngine,
  type WebDavSyncEngineOptions,
} from '@electron/services/sync/webdavSync/engine'
import type { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService'
import type { WorkspaceSyncConfigStore } from '@electron/services/sync/workspaceSyncConfig'

type WorkspaceTarget = Pick<
  WorkspaceFileService,
  'flushBuffers' | 'invalidateExternalPaths' | 'rootInfo' | 'runExternalPathMutation'
>

type ConflictWorkspaceTarget = WorkspaceTarget & { getSessionGeneration?: () => number }

type SyncEngine = Pick<WebDavSyncEngine, 'sync'>

export type WorkspaceWebDavSyncDependencies = {
  configStore: WorkspaceSyncConfigStore
  profileStore: WebDavProfileStoreContract
  stateStore: LocalSyncStateStore
  coordinator?: WorkspaceSyncCoordinator
  createEngine?: (options: WebDavSyncEngineOptions) => SyncEngine
  createRemoteClient?: (
    profile: WebDavProfile,
    password: string | null,
  ) => Promise<WebDavRemoteClient>
  createRemoteStore?: (client: WebDavRemoteClient, remoteRoot: string) => RemoteFileStore
}

export type WorkspaceWebDavSyncRunOptions = {
  signal?: AbortSignal
  onProgress?: (progress: SyncProgress) => void
}

export class WorkspaceWebDavSyncService {
  private readonly coordinator: WorkspaceSyncCoordinator
  private readonly createEngine: (options: WebDavSyncEngineOptions) => SyncEngine
  private readonly createRemoteClient: NonNullable<
    WorkspaceWebDavSyncDependencies['createRemoteClient']
  >
  private readonly createRemoteStore: NonNullable<
    WorkspaceWebDavSyncDependencies['createRemoteStore']
  >

  constructor(private readonly dependencies: WorkspaceWebDavSyncDependencies) {
    this.coordinator = dependencies.coordinator ?? new WorkspaceSyncCoordinator()
    this.createEngine = dependencies.createEngine ?? ((options) => new WebDavSyncEngine(options))
    this.createRemoteClient = dependencies.createRemoteClient ?? createWebDavRemoteClient
    this.createRemoteStore = dependencies.createRemoteStore ?? createWebDavRemoteFileStore
  }

  sync(
    workspace: WorkspaceTarget,
    options: WorkspaceWebDavSyncRunOptions = {},
  ): Promise<WorkspaceSyncResult> {
    const root = workspaceRoot(workspace)
    return this.coordinator.runSync(
      root,
      async (signal) => {
        assertWorkspaceRoot(workspace, root)
        const binding = (await this.dependencies.configStore.getChannels(root)).webdav
        if (!binding) {
          throw new Error('WebDAV sync is not configured for this workspace')
        }
        const profile = await this.requiredProfile(binding.profileId)
        const password = await this.dependencies.profileStore.resolvePassword(profile.id)
        const client = await this.createRemoteClient(profile, password)
        const remote = this.createRemoteStore(client, binding.remoteRoot)
        const deviceId = await this.dependencies.configStore.getOrCreateDeviceId()
        assertWorkspaceRoot(workspace, root)
        const engine = this.createEngine({
          deviceId,
          remote,
          stateStore: this.dependencies.stateStore,
          flushWorkspace: async (candidateRoot, _reason, flushSignal) => {
            assertSameRoot(root, candidateRoot)
            flushSignal.throwIfAborted()
            assertWorkspaceRoot(workspace, root)
          },
          mutationBoundary: async ({ root: candidateRoot, relativePaths, work }) => {
            assertSameRoot(root, candidateRoot)
            assertWorkspaceRoot(workspace, root)
            return workspace.runExternalPathMutation(relativePaths, async () => {
              assertWorkspaceRoot(workspace, root)
              const result = await work()
              assertWorkspaceRoot(workspace, root)
              return result
            })
          },
          invalidateWorkspace: (candidateRoot, changedPaths) => {
            assertSameRoot(root, candidateRoot)
            assertWorkspaceRoot(workspace, root)
            workspace.invalidateExternalPaths(changedPaths)
          },
        })
        signal.throwIfAborted()
        assertWorkspaceRoot(workspace, root)
        await workspace.flushBuffers()
        signal.throwIfAborted()
        assertWorkspaceRoot(workspace, root)
        const result = await engine.sync(root, { signal, onProgress: options.onProgress })
        assertWorkspaceRoot(workspace, root)
        return result
      },
      { signal: options.signal },
    )
  }

  async listConflicts(workspace: ConflictWorkspaceTarget, expectedRoot: string) {
    const root = workspaceRoot(workspace)
    assertSameRoot(expectedRoot, root)
    const generation = workspace.getSessionGeneration?.()
    const state = await this.dependencies.stateStore.load(root)
    const binding = (await this.dependencies.configStore.getChannels(root)).webdav
    assertWorkspaceRoot(workspace, root)
    if (generation !== workspace.getSessionGeneration?.())
      throw new Error('Workspace sync session changed')
    return {
      conflicts: state?.unresolvedConflicts ?? [],
      binding: binding ? { profileId: binding.profileId, remoteRoot: binding.remoteRoot } : null,
    }
  }

  readConflict(workspace: ConflictWorkspaceTarget, request: WorkspaceSyncConflictRequest) {
    return this.runConflictOperation(workspace, request, async (root, signal, assertContext) => {
      await workspace.flushBuffers()
      await assertContext()
      const result = await compareSyncConflict(
        root,
        request.path,
        this.dependencies.stateStore,
        signal,
      )
      await assertContext()
      return result
    })
  }

  resolveConflict(workspace: ConflictWorkspaceTarget, request: WorkspaceSyncConflictResolution) {
    return this.runConflictOperation(workspace, request, async (root, signal, assertContext) => {
      const profile = await this.requiredProfile(request.binding.profileId)
      const password = await this.dependencies.profileStore.resolvePassword(profile.id)
      const client = await this.createRemoteClient(profile, password)
      const remote = this.createRemoteStore(client, request.binding.remoteRoot)
      await workspace.flushBuffers()
      await assertContext()
      const state = await this.dependencies.stateStore.load(root)
      const conflict = state?.unresolvedConflicts?.find((entry) => entry.path === request.path)
      const paths = [request.path, ...(conflict?.conflictPath ? [conflict.conflictPath] : [])]
      const generation = workspace.getSessionGeneration?.()
      return workspace.runExternalPathMutation(paths, async () => {
        const changedPaths = new Set<string>()
        try {
          return await resolveSyncConflict({
            root,
            request,
            remote,
            signal,
            assertContext,
            stateStore: this.dependencies.stateStore,
            onChangedPath: (relativePath) => changedPaths.add(relativePath),
          })
        } finally {
          const current = workspace.rootInfo()
          if (
            changedPaths.size > 0 &&
            current.kind !== 'single' &&
            normalizeRoot(current.path) === normalizeRoot(root) &&
            generation === workspace.getSessionGeneration?.()
          ) {
            workspace.invalidateExternalPaths([...changedPaths])
          }
        }
      })
    })
  }

  private runConflictOperation<T>(
    workspace: ConflictWorkspaceTarget,
    request: WorkspaceSyncConflictRequest,
    work: (root: string, signal: AbortSignal, assertContext: () => Promise<void>) => Promise<T>,
  ): Promise<T> {
    const root = workspaceRoot(workspace)
    const generation = workspace.getSessionGeneration?.()
    assertSameRoot(request.rootPath, root)
    const assertContext = async () => {
      assertWorkspaceRoot(workspace, root)
      if (generation !== workspace.getSessionGeneration?.())
        throw new Error('Workspace sync session changed')
      const binding = (await this.dependencies.configStore.getChannels(root)).webdav
      if (
        !binding ||
        binding.profileId !== request.binding.profileId ||
        binding.remoteRoot !== request.binding.remoteRoot
      ) {
        throw new Error('Workspace sync binding changed; refresh the conflicts')
      }
      assertWorkspaceRoot(workspace, root)
    }
    return this.coordinator.runSync(root, (signal) =>
      this.coordinator.runConfigurationMutation(async () => {
        signal.throwIfAborted()
        await assertContext()
        return work(root, signal, assertContext)
      }),
    )
  }

  cancel(root: string): boolean {
    return this.coordinator.cancel(root)
  }

  async testConnection(profileId: string, signal?: AbortSignal): Promise<WebDavConnectionResult> {
    const profile = await this.requiredProfile(profileId)
    const password = await this.dependencies.profileStore.resolvePassword(profile.id)
    const client = await this.createRemoteClient(profile, password)
    return client.testConnection({ signal })
  }

  private async requiredProfile(profileId: string): Promise<WebDavProfile> {
    const profile = await this.dependencies.profileStore.get(profileId)
    if (!profile) throw new Error('WebDAV profile was not found')
    return profile
  }
}

const workspaceRoot = (workspace: WorkspaceTarget): string => {
  const root = workspace.rootInfo()
  if (root.kind === 'single') throw new Error('WebDAV sync is unavailable in single-file mode')
  return path.resolve(root.path)
}

const assertSameRoot = (expected: string, actual: string): void => {
  if (normalizeRoot(expected) !== normalizeRoot(actual))
    throw new Error('Workspace sync root changed')
}

const assertWorkspaceRoot = (workspace: WorkspaceTarget, expected: string): void => {
  const current = workspace.rootInfo()
  if (current.kind === 'single' || normalizeRoot(current.path) !== normalizeRoot(expected)) {
    throw new Error('Workspace sync root changed')
  }
}

const normalizeRoot = (value: string): string => {
  const resolved = path.resolve(value).normalize('NFC')
  return process.platform === 'win32' || process.platform === 'darwin'
    ? resolved.toLowerCase()
    : resolved
}
