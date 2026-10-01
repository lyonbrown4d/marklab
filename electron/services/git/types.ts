export type GitRepoInfo = {
  is_repository: boolean
  workdir?: string | null
  git_dir?: string | null
  branch?: string | null
  head?: string | null
}

export type GitFileChange = {
  path: string
  old_path?: string | null
  status:
    | 'added'
    | 'modified'
    | 'deleted'
    | 'renamed'
    | 'copied'
    | 'conflicted'
    | 'untracked'
    | 'ignored'
    | 'tracked'
    | 'pruned'
  detail: string
}

export type GitStatusSnapshot = {
  repo: GitRepoInfo
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: GitFileChange[]
  conflicts: GitFileChange[]
}

export type GitFileDiff = {
  path: string
  old_path?: string | null
  original_label: string
  modified_label: string
  original_content: string
  modified_content: string
  unified_diff?: string
}

export type GitRemote = {
  name: string
  fetch_url: string | null
  push_url: string | null
}

export type GitRemoteStatus = {
  remotes: GitRemote[]
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  detached: boolean
}

export type GitPushOptions = {
  setUpstream?: boolean
  remote?: string
}

export type GitCloneResult = {
  cancelled: false
  repository: GitRepoInfo
}

export type GitErrorCode =
  | 'git_conflicts_present'
  | 'git_detached_head'
  | 'git_dirty_worktree'
  | 'git_invalid_input'
  | 'git_not_repository'
  | 'git_operation_cancelled'
  | 'git_unsafe_configuration'
  | 'git_upstream_missing'
  | 'git_workspace_boundary'
  | 'git_command_failed'
