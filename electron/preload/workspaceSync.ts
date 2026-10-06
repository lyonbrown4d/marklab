import type { IpcRenderer, IpcRendererEvent } from 'electron'

import { nativeIpcChannels } from '@electron/channels'
import type { WorkspaceSyncApi } from '@/runtime/workspaceSync'
import type { WorkspaceSyncProgressEvent } from '@/types/workspaceSync'

type WorkspaceSyncIpcRenderer = Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>

export const createWorkspaceSyncPreloadSurface = (
  ipcRenderer: WorkspaceSyncIpcRenderer,
): WorkspaceSyncApi => ({
  channels: {
    get: () => ipcRenderer.invoke(nativeIpcChannels.syncChannelsGet),
    remove: (provider) => ipcRenderer.invoke(nativeIpcChannels.syncChannelRemove, { provider }),
    set: (channel) => ipcRenderer.invoke(nativeIpcChannels.syncChannelSet, channel),
  },
  cancel: (requestId) => ipcRenderer.invoke(nativeIpcChannels.syncCancel, { requestId }),
  gitSummary: () => ipcRenderer.invoke(nativeIpcChannels.syncGitSummary),
  onProgress: (handler) => {
    const listener = (_event: IpcRendererEvent, payload: WorkspaceSyncProgressEvent) => {
      handler(payload)
    }
    ipcRenderer.on(nativeIpcChannels.syncProgress, listener)
    return () => ipcRenderer.removeListener(nativeIpcChannels.syncProgress, listener)
  },
  start: (requestId) => ipcRenderer.invoke(nativeIpcChannels.syncStart, { requestId }),
  webDavProfiles: {
    delete: (id) => ipcRenderer.invoke(nativeIpcChannels.webDavProfileDelete, { id }),
    list: () => ipcRenderer.invoke(nativeIpcChannels.webDavProfileList),
    test: (id) => ipcRenderer.invoke(nativeIpcChannels.webDavProfileTest, { id }),
    update: (input) => ipcRenderer.invoke(nativeIpcChannels.webDavProfileUpdate, input),
  },
})
