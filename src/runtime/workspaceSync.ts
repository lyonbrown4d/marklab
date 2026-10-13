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
    ) => Promise<{ ok: true; backupPath?: string }>
  }
  channels: {
    get: () => Promise<WorkspaceSyncChannels>
    remove: () => Promise<WorkspaceSyncChannels>
    set: (channel: WorkspaceSyncChannel) => Promise<WorkspaceSyncChannels>
  }
  cancel: (requestId: string) => Promise<{ ok: true; cancelled: boolean }>
  onProgress: (handler: (event: WorkspaceSyncProgressEvent) => void) => () => void
  start: (requestId: string) => Promise<WorkspaceSyncStartOutcome>
  webDavProfiles: {
    delete: (id: string) => Promise<{ ok: true }>
    list: () => Promise<WebDavProfile[]>
    test: (id: string) => Promise<{ ok: true } | { ok: false; code: string; message: string }>
    update: (input: WebDavProfileInput) => Promise<WebDavProfile>
  }
}
