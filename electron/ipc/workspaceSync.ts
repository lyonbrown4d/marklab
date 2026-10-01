import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

import { nativeIpcChannels } from '@electron/channels.js'
import { webDavProfileInputSchema } from '@electron/services/sync/webdav/profileSchemas.js'
import type { WebDavProfileStoreContract } from '@electron/services/sync/webdav/types.js'
import {
  workspaceSyncBindingSchema,
  type WorkspaceSyncConfigStore,
} from '@electron/services/sync/workspaceSyncConfig.js'
import type { WorkspaceWebDavSyncService } from '@electron/services/sync/workspaceWebDavSyncService.js'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry.js'

type WorkspaceSyncIpcDependencies = {
  configStore: WorkspaceSyncConfigStore
  profileStore: WebDavProfileStoreContract
  syncService: WorkspaceWebDavSyncService
  workspaceRegistry: WindowWorkspaceRegistry
}

const profileIdSchema = z.object({ id: z.string().trim().min(1).max(128) }).strict()
const syncStartSchema = z.object({ requestId: z.uuid() }).strict()

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
    return dependencies.profileStore.delete(id)
  })
  ipcMain.handle(nativeIpcChannels.webDavProfileTest, async (_event, payload: unknown) => {
    const { id } = profileIdSchema.parse(payload)
    return dependencies.syncService.testConnection(id)
  })
  ipcMain.handle(nativeIpcChannels.syncBindingGet, (event) =>
    dependencies.configStore.get(rootFor(event)),
  )
  ipcMain.handle(nativeIpcChannels.syncBindingSet, async (event, payload: unknown) =>
    dependencies.configStore.set(rootFor(event), workspaceSyncBindingSchema.parse(payload)),
  )
  ipcMain.handle(nativeIpcChannels.syncBindingRemove, (event) =>
    dependencies.configStore.remove(rootFor(event)),
  )
  ipcMain.handle(nativeIpcChannels.syncStart, async (event, payload: unknown) => {
    const { requestId } = syncStartSchema.parse(payload)
    const workspace = workspaceFor(event)
    subscribeToDestruction(event, workspace, dependencies.syncService)
    return dependencies.syncService.sync(workspace, {
      onProgress: (progress) => {
        if (event.sender.isDestroyed()) return
        try {
          event.sender.send(nativeIpcChannels.syncProgress, { requestId, progress })
        } catch {
          // The renderer may be destroyed between checking and sending.
        }
      },
    })
  })
  ipcMain.handle(nativeIpcChannels.syncCancel, (event) => ({
    ok: true as const,
    cancelled: dependencies.syncService.cancel(workspaceFor(event)),
  }))
}

const subscribedSenders = new WeakSet<object>()

const subscribeToDestruction = (
  event: IpcMainInvokeEvent,
  workspace: ReturnType<WindowWorkspaceRegistry['serviceForWebContents']>,
  syncService: WorkspaceWebDavSyncService,
): void => {
  if (subscribedSenders.has(event.sender)) return
  subscribedSenders.add(event.sender)
  event.sender.once('destroyed', () => syncService.cancel(workspace))
}
