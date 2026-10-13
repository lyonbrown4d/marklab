export type RecentWorkspace = {
  path: string
  status: 'available' | 'missing' | 'unavailable'
}

export type RecentWorkspacesApi = {
  list: () => Promise<RecentWorkspace[]>
  remove: (path: string) => Promise<void>
  watch: (handler: () => void) => Promise<() => void>
}
