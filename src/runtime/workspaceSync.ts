import type { DesktopCommandResults } from '@/generated/desktop/bindings'
import type {
  WebDavProfile,
  WebDavProfileInput,
  WorkspaceSyncChannel,
  WorkspaceSyncConflictList,
  WorkspaceSyncConflictRequest,
  WorkspaceSyncConflictComparison,
  WorkspaceSyncConflictResolution,
  WorkspaceSyncChannels,
  WorkspaceSyncProgressEvent,
  WorkspaceSyncStartOutcome,
} from '@/types/workspaceSync'

export type WorkspaceSyncApi = {
  conflicts: {
    list: (rootPath: string) => Promise<WorkspaceSyncConflictList>
    read: (request: WorkspaceSyncConflictRequest) => Promise<WorkspaceSyncConflictComparison>
    resolve: (
      request: WorkspaceSyncConflictResolution,
    ) => Promise<DesktopCommandResults['sync_conflicts_resolve']>
  }
  channels: {
    get: () => Promise<WorkspaceSyncChannels>
    remove: () => Promise<WorkspaceSyncChannels>
    set: (channel: WorkspaceSyncChannel) => Promise<WorkspaceSyncChannels>
  }
  cancel: (requestId: string) => Promise<DesktopCommandResults['sync_cancel']>
  onProgress: (handler: (event: WorkspaceSyncProgressEvent) => void) => () => void
  start: (requestId: string) => Promise<WorkspaceSyncStartOutcome>
  webDavProfiles: {
    delete: (id: string) => Promise<DesktopCommandResults['webdav_profile_delete']>
    list: () => Promise<WebDavProfile[]>
    test: (id: string) => Promise<DesktopCommandResults['webdav_profile_test']>
    update: (input: WebDavProfileInput) => Promise<WebDavProfile>
  }
}
