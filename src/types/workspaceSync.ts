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

export type GitWorkspaceSyncChannel = {
  provider: 'git'
  remote: string
  branch?: string
  autoFetch: boolean
}

export type WebDavWorkspaceSyncChannel = {
  provider: 'webdav'
  profileId: string
  remoteRoot: string
  autoSync: boolean
}

export type WorkspaceSyncChannel = GitWorkspaceSyncChannel | WebDavWorkspaceSyncChannel

export type WorkspaceSyncProvider = WorkspaceSyncChannel['provider']

export type WorkspaceSyncChannels = {
  git: GitWorkspaceSyncChannel | null
  webdav: WebDavWorkspaceSyncChannel | null
}

export type WorkspaceGitRemoteSummary = {
  name: string
  fetchUrl: string | null
  pushUrl: string | null
}

export type WorkspaceGitSummary =
  | { status: 'not_repository' }
  | {
      status: 'ready'
      branch: string | null
      head: string | null
      upstream: string | null
      ahead: number
      behind: number
      detached: boolean
      clean: boolean
      changeCount: number
      conflictCount: number
      remotes: WorkspaceGitRemoteSummary[]
    }
  | {
      status: 'error'
      code: 'git_detection_failed'
      message: string
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
