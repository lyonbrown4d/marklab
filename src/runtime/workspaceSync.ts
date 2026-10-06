import type {
  WebDavProfile,
  WebDavProfileInput,
  WorkspaceSyncChannel,
  WorkspaceSyncChannels,
  WorkspaceSyncProgressEvent,
  WorkspaceSyncStartOutcome,
} from '@/types/workspaceSync'

export type WorkspaceSyncApi = {
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
