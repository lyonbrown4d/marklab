import type { DesktopCommandResults } from '@/generated/desktop/bindings'

export type RecentWorkspace = DesktopCommandResults['recent_workspaces_list'][number]

export type RecentWorkspacesApi = {
  list: () => Promise<RecentWorkspace[]>
  remove: (path: string) => Promise<void>
  watch: (handler: () => void) => Promise<() => void>
}
