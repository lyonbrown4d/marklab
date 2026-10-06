import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

import { nativeIpcChannels } from '@electron/channels'
import type { GitService } from '@electron/services/git/service'
import type { WorkspaceSyncCoordinator } from '@electron/services/sync/core/coordinator'
import { webDavProfileInputSchema } from '@electron/services/sync/webdav/profileSchemas'
import { readWorkspaceGitSummary } from '@electron/services/sync/workspaceGitSummary'
import type { WebDavProfileStoreContract } from '@electron/services/sync/webdav/types'
import {
  workspaceSyncChannelSchema,
  type WorkspaceSyncConfigStore,
} from '@electron/services/sync/workspaceSyncConfig'
import type { WorkspaceWebDavSyncService } from '@electron/services/sync/workspaceWebDavSyncService'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'
import type { WorkspaceSyncStartOutcome } from '@/types/workspaceSync'

type WorkspaceSyncIpcDependencies = {
  configStore: WorkspaceSyncConfigStore
  gitService: GitService
  profileStore: WebDavProfileStoreContract
  syncService: WorkspaceWebDavSyncService
  workspaceMutationCoordinator: Pick<WorkspaceSyncCoordinator, 'runConfigurationMutation'>
  workspaceRegistry: WindowWorkspaceRegistry
}

const profileIdSchema = z.object({ id: z.string().trim().min(1).max(128) }).strict()
const syncStartSchema = z.object({ requestId: z.uuid() }).strict()
const syncCancelSchema = z.object({ requestId: z.uuid() }).strict()
const syncProviderSchema = z.object({ provider: z.enum(['git', 'webdav']) }).strict()

export const registerWorkspaceSyncIpc = (
  ipcMain: IpcMain,
  dependencies: WorkspaceSyncIpcDependencies,
): void => {
  const workspaceFor = (event: IpcMainInvokeEvent) =>
    dependencies.workspaceRegistry.serviceForWebContents(event.sender)
  const rootFor = (event: IpcMainInvokeEvent): string => {
    const root = workspaceFor(event).rootInfo()
    if (root.kind === 'single') throw new Error('Sync is unavailable in single-file mode')
    return root.path
  }

  ipcMain.handle(nativeIpcChannels.webDavProfileList, () => dependencies.profileStore.list())
  ipcMain.handle(nativeIpcChannels.webDavProfileUpdate, async (_event, payload: unknown) =>
    dependencies.profileStore.update(webDavProfileInputSchema.parse(payload)),
  )
  ipcMain.handle(nativeIpcChannels.webDavProfileDelete, async (_event, payload: unknown) => {
    const { id } = profileIdSchema.parse(payload)
    return dependencies.workspaceMutationCoordinator.runConfigurationMutation(async () => {
      const isBound = (await dependencies.configStore.listChannels()).some(
        (record) => record.channels.webdav?.profileId === id,
      )
      if (isBound) throw new Error('WebDAV profile is still bound to a workspace')
      return dependencies.profileStore.delete(id)
    })
  })
  ipcMain.handle(nativeIpcChannels.webDavProfileTest, async (_event, payload: unknown) => {
    const { id } = profileIdSchema.parse(payload)
    return dependencies.syncService.testConnection(id)
  })
  ipcMain.handle(nativeIpcChannels.syncChannelsGet, (event) =>
    dependencies.configStore.getChannels(rootFor(event)),
  )
  ipcMain.handle(nativeIpcChannels.syncChannelSet, async (event, payload: unknown) => {
    const channel = workspaceSyncChannelSchema.parse(payload)
    const root = rootFor(event)
    return dependencies.workspaceMutationCoordinator.runConfigurationMutation(async () => {
      if (
        channel.provider === 'webdav' &&
        !(await dependencies.profileStore.get(channel.profileId))
      ) {
        throw new Error('WebDAV profile was not found')
      }
      return dependencies.configStore.setChannel(root, channel)
    })
  })
  ipcMain.handle(nativeIpcChannels.syncChannelRemove, async (event, payload: unknown) => {
    const { provider } = syncProviderSchema.parse(payload)
    const root = rootFor(event)
    return dependencies.workspaceMutationCoordinator.runConfigurationMutation(() =>
      dependencies.configStore.removeChannel(root, provider),
    )
  })
  ipcMain.handle(nativeIpcChannels.syncGitSummary, (event) =>
    readWorkspaceGitSummary(dependencies.gitService, rootFor(event)),
  )
  ipcMain.handle(nativeIpcChannels.syncStart, async (event, payload: unknown) => {
    const { requestId } = syncStartSchema.parse(payload)
    const workspace = workspaceFor(event)
    const root = rootFor(event)
    trackSync(event.sender, requestId, root)
    subscribeToDestruction(event, dependencies.syncService)
    try {
      const result = await dependencies.syncService.sync(workspace, {
        onProgress: (progress) => {
          if (event.sender.isDestroyed()) return
          try {
            event.sender.send(nativeIpcChannels.syncProgress, { requestId, progress })
          } catch {
            // The renderer may be destroyed between checking and sending.
          }
        },
      })
      return { status: 'completed', result } satisfies WorkspaceSyncStartOutcome
    } catch (error) {
      return syncStartFailureOutcome(error)
    } finally {
      untrackSync(event.sender, requestId)
    }
  })
  ipcMain.handle(nativeIpcChannels.syncCancel, async (event, payload: unknown) => {
    const { requestId } = syncCancelSchema.parse(payload)
    return {
      ok: true as const,
      cancelled: cancelTrackedSyncs(event.sender, dependencies.syncService, requestId),
    }
  })
}

const syncStartFailureOutcome = (error: unknown): WorkspaceSyncStartOutcome => {
  if (hasErrorField(error, 'code', 'workspace_sync_busy')) return { status: 'busy' }
  if (hasErrorField(error, 'name', 'AbortError')) return { status: 'cancelled' }
  return {
    status: 'failed',
    message: error instanceof Error ? error.message : 'Workspace sync failed',
  }
}

const hasErrorField = (error: unknown, field: 'code' | 'name', value: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  field in error &&
  (error as Record<'code' | 'name', unknown>)[field] === value

const subscribedSenders = new WeakSet<object>()
const activeSyncsBySender = new WeakMap<object, Map<string, string>>()

const subscribeToDestruction = (
  event: IpcMainInvokeEvent,
  syncService: WorkspaceWebDavSyncService,
): void => {
  if (subscribedSenders.has(event.sender)) return
  subscribedSenders.add(event.sender)
  event.sender.once('destroyed', () => cancelTrackedSyncs(event.sender, syncService))
}

const trackSync = (sender: object, requestId: string, root: string): void => {
  const active = activeSyncsBySender.get(sender) ?? new Map<string, string>()
  active.set(requestId, root)
  activeSyncsBySender.set(sender, active)
}

const untrackSync = (sender: object, requestId: string): void => {
  const active = activeSyncsBySender.get(sender)
  active?.delete(requestId)
  if (active?.size === 0) activeSyncsBySender.delete(sender)
}

const cancelTrackedSyncs = (
  sender: object,
  syncService: WorkspaceWebDavSyncService,
  requestId?: string,
): boolean => {
  const active = activeSyncsBySender.get(sender)
  if (!active) return false
  const roots = requestId ? [active.get(requestId)] : [...new Set(active.values())]
  let cancelled = false
  for (const root of roots) {
    if (root && syncService.cancel(root)) cancelled = true
  }
  return cancelled
}
