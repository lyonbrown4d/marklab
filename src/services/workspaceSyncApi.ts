import { getDesktopRuntime } from '@/runtime/desktop'
import type {
  WebDavProfile,
  WebDavProfileInput,
  WorkspaceSyncChannel,
  WorkspaceSyncConflictRequest,
  WorkspaceSyncConflictResolution,
  WorkspaceSyncChannels,
  WorkspaceSyncProgressEvent,
  WorkspaceSyncResult,
} from '@/types/workspaceSync'

const runtime = () => getDesktopRuntime().workspaceSync

export const workspaceSyncApi = {
  listConflicts: (rootPath: string) => runtime().conflicts.list(rootPath),
  readConflict: (request: WorkspaceSyncConflictRequest) => runtime().conflicts.read(request),
  resolveConflict: (request: WorkspaceSyncConflictResolution) =>
    runtime().conflicts.resolve(request),
  listWebDavProfiles: (): Promise<WebDavProfile[]> => runtime().webDavProfiles.list(),
  saveWebDavProfile: (input: WebDavProfileInput): Promise<WebDavProfile> =>
    runtime().webDavProfiles.update(input),
  deleteWebDavProfile: (id: string) => runtime().webDavProfiles.delete(id),
  testWebDavProfile: (id: string) => runtime().webDavProfiles.test(id),
  getChannels: (): Promise<WorkspaceSyncChannels> => runtime().channels.get(),
  setChannel: (channel: WorkspaceSyncChannel): Promise<WorkspaceSyncChannels> =>
    runtime().channels.set(channel),
  removeChannel: (): Promise<WorkspaceSyncChannels> => runtime().channels.remove(),
  start: async (requestId: string): Promise<WorkspaceSyncResult> => {
    const outcome = await runtime().start(requestId)
    if (outcome.status === 'completed') return outcome.result
    if (outcome.status === 'cancelled') {
      const error = new Error('Workspace sync was cancelled')
      error.name = 'AbortError'
      throw error
    }
    if (outcome.status === 'busy') {
      throw Object.assign(new Error('A workspace sync is already running'), {
        name: 'WorkspaceSyncBusyError',
        code: 'workspace_sync_busy' as const,
      })
    }
    throw new Error(outcome.message)
  },
  cancel: (requestId: string) => runtime().cancel(requestId),
  onProgress: (handler: (event: WorkspaceSyncProgressEvent) => void) =>
    runtime().onProgress(handler),
}
