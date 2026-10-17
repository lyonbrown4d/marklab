import { getDesktopRuntime, isDesktopRuntime } from '@/runtime/desktop'

export const hasRecentWorkspaceHistoryApi = (): boolean => isDesktopRuntime()

const historyApi = () => getDesktopRuntime().settings.recentWorkspaces

export const listRecentWorkspaces = () => historyApi().list()
export const removeRecentWorkspace = (path: string) => historyApi().remove(path)
export const watchRecentWorkspaces = async (handler: () => void) => historyApi().watch(handler)
