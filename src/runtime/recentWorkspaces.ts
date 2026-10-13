import { getElectronRuntime, isElectronRuntime } from '@/runtime/electron'
import type { RecentWorkspacesApi } from '@/types/recentWorkspaces'

export const hasRecentWorkspaceHistoryApi = (): boolean =>
  isElectronRuntime() && Boolean(getElectronRuntime().settings?.recentWorkspaces)

const historyApi = (): RecentWorkspacesApi => {
  const api = getElectronRuntime()?.settings?.recentWorkspaces
  if (!api) throw new Error('Recent workspace history API is unavailable')
  return api
}

export const listRecentWorkspaces = () => historyApi().list()
export const removeRecentWorkspace = (path: string) => historyApi().remove(path)
export const watchRecentWorkspaces = async (handler: () => void) => historyApi().watch(handler)
