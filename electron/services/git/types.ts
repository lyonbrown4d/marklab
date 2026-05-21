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
