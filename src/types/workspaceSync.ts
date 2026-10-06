export type WebDavProfile = {
  id: string
  label: string
  endpoint: string
  basePath: string
  username: string
  allowInsecureLocal: boolean
  sessionOnly: boolean
  hasPassword: boolean
  createdAt: string
  updatedAt: string
}

export type WebDavProfileInput = {
  id: string
  label: string
  endpoint: string
  basePath?: string
  username: string
  password?: string | null
  allowInsecureLocal?: boolean
  sessionOnly?: boolean
}

export type WebDavWorkspaceSyncChannel = {
  provider: 'webdav'
  profileId: string
  remoteRoot: string
  autoSync: boolean
}

export type WorkspaceSyncChannel = WebDavWorkspaceSyncChannel

export type WorkspaceSyncChannels = {
  webdav: WebDavWorkspaceSyncChannel | null
}

export type WorkspaceSyncProgress = {
  stage:
    | 'flushing'
    | 'scanning'
    | 'reading_remote'
    | 'planning'
    | 'applying'
    | 'writing_manifest'
    | 'invalidating'
    | 'completed'
  completed: number
  total: number
  path?: string
}

export type WorkspaceSyncConflict = {
  path: string
  status: 'unresolved'
  reason: 'both_changed' | 'delete_vs_change'
  conflictPath?: string
  localHash?: string
  remoteHash?: string
}

export type WorkspaceSyncResult = {
  changedPaths: string[]
  conflicts: WorkspaceSyncConflict[]
  skipped: Array<{ path: string; reason: 'file_too_large'; size: number }>
  uploaded: number
  downloaded: number
  deleted: number
  retries: number
}

export type WorkspaceSyncStartOutcome =
  | { status: 'completed'; result: WorkspaceSyncResult }
  | { status: 'cancelled' }
  | { status: 'busy' }
  | { status: 'failed'; message: string }

export type WorkspaceSyncProgressEvent = {
  requestId: string
  progress: WorkspaceSyncProgress
}
