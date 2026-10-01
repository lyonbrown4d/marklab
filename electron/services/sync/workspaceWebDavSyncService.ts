import path from 'node:path'

import type {
  LocalSyncStateStore,
  RemoteFileStore,
  SyncProgress,
  WorkspaceSyncResult,
} from '@electron/services/sync/core/types.js'
import { WorkspaceSyncCoordinator } from '@electron/services/sync/core/coordinator.js'
import {
  createWebDavRemoteClient,
  createWebDavRemoteFileStore,
} from '@electron/services/sync/webdav/index.js'
import type {
  WebDavConnectionResult,
  WebDavProfile,
  WebDavProfileStoreContract,
  WebDavRemoteClient,
} from '@electron/services/sync/webdav/types.js'
import {
  WebDavSyncEngine,
  type WebDavSyncEngineOptions,
} from '@electron/services/sync/webdavSync/engine.js'
import type { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService.js'
import type { WorkspaceSyncConfigStore } from '@electron/services/sync/workspaceSyncConfig.js'

type WorkspaceTarget = Pick<
  WorkspaceFileService,
  'flushBuffers' | 'invalidateExternalPaths' | 'rootInfo' | 'runExternalPathMutation'
>

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
        const binding = await this.dependencies.configStore.get(root)
        if (!binding || binding.provider !== 'webdav') {
          throw new Error('WebDAV sync is not configured for this workspace')
        }
        const profile = await this.requiredProfile(binding.profileId)
        const password = await this.dependencies.profileStore.resolvePassword(profile.id)
        const client = await this.createRemoteClient(profile, password)
        const remote = this.createRemoteStore(client, binding.remoteRoot)
        const deviceId = await this.dependencies.configStore.getOrCreateDeviceId()
        const engine = this.createEngine({
          deviceId,
          remote,
          stateStore: this.dependencies.stateStore,
          flushWorkspace: async (candidateRoot, _reason, flushSignal) => {
            assertSameRoot(root, candidateRoot)
            flushSignal.throwIfAborted()
            await workspace.flushBuffers()
          },
          mutationBoundary: ({ root: candidateRoot, relativePaths, work }) => {
            assertSameRoot(root, candidateRoot)
            return workspace.runExternalPathMutation(relativePaths, work)
          },
          invalidateWorkspace: (candidateRoot, changedPaths) => {
            assertSameRoot(root, candidateRoot)
            workspace.invalidateExternalPaths(changedPaths)
          },
        })
        return engine.sync(root, { signal, onProgress: options.onProgress })
      },
      { signal: options.signal },
    )
  }

  cancel(workspace: WorkspaceTarget): boolean {
    return this.coordinator.cancel(workspaceRoot(workspace))
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
  const normalize = (value: string) => {
    const resolved = path.resolve(value)
    return process.platform === 'win32' || process.platform === 'darwin'
      ? resolved.toLowerCase()
      : resolved
  }
  if (normalize(expected) !== normalize(actual)) throw new Error('Workspace sync root changed')
}
