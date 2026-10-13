import { ipcRenderer, type IpcRenderer } from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import { hasExactKeys, isRecord } from '@electron/preload/workspaceValidators'
import type { RecentWorkspace, RecentWorkspacesApi } from '@/types/recentWorkspaces'

const isRecentWorkspace = (value: unknown): value is RecentWorkspace =>
  hasExactKeys(value, ['path', 'status']) &&
  typeof value.path === 'string' &&
  (value.status === 'available' || value.status === 'missing' || value.status === 'unavailable')

export const createRecentWorkspacesPreloadSurface = (
  renderer: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener' | 'send'> = ipcRenderer,
): RecentWorkspacesApi => {
  let nextSubscriptionId = 0
  return {
    list: async () => {
      const result: unknown = await renderer.invoke(nativeIpcChannels.recentWorkspacesList)
      if (!Array.isArray(result) || !result.every(isRecentWorkspace)) {
        throw new Error('Invalid recent workspace history response')
      }
      return result
    },
    remove: async (path) => {
      const result: unknown = await renderer.invoke(nativeIpcChannels.recentWorkspacesRemove, path)
      if (!isRecord(result) || typeof result.ok !== 'boolean')
        throw new Error('Invalid history removal response')
      if (!result.ok)
        throw new Error(
          typeof result.error === 'string' ? result.error : 'Unable to remove workspace history',
        )
    },
    watch: async (handler) => {
      const id = ++nextSubscriptionId
      const listener = () => handler()
      renderer.on(nativeIpcChannels.recentWorkspacesChanged, listener)
      try {
        const result: unknown = await renderer.invoke(
          nativeIpcChannels.recentWorkspacesWatchStart,
          id,
        )
        if (!isRecord(result) || result.ok !== true)
          throw new Error('Unable to watch workspace history')
      } catch (error) {
        renderer.removeListener(nativeIpcChannels.recentWorkspacesChanged, listener)
        throw error
      }
      return () => {
        renderer.removeListener(nativeIpcChannels.recentWorkspacesChanged, listener)
        renderer.send(nativeIpcChannels.recentWorkspacesWatchStop, id)
      }
    },
  }
}
