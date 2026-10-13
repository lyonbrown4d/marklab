import {
  hasRecentWorkspaceHistoryApi,
  listRecentWorkspaces,
  removeRecentWorkspace,
  watchRecentWorkspaces,
} from '@/runtime/recentWorkspaces'

export const recentWorkspaceApi = {
  isAvailable: hasRecentWorkspaceHistoryApi,
  list: listRecentWorkspaces,
  remove: removeRecentWorkspace,
  watch: watchRecentWorkspaces,
}
