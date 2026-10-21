import type { DesktopCommandResults } from '@/generated/desktop/bindings'
import type { GitHistoryOptions, GitResetMode } from '@/types/gitOperations'
import type { GitConflictSaveRequest } from '@/types/gitConflicts'
import type { GitOpenFileRequest } from '@/types/gitPreview'

type Scope = string | undefined
export type DesktopGitApi = {
  openFile: (
    request: GitOpenFileRequest,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_open_file']>
  discover: (expectedRoot?: Scope) => Promise<DesktopCommandResults['git_discover']>
  init: (expectedRoot?: Scope) => Promise<DesktopCommandResults['git_init']>
  status: (expectedRoot?: Scope) => Promise<DesktopCommandResults['git_status']>
  fileDiff: (
    path: string,
    section: 'staged' | 'unstaged' | 'untracked' | 'conflicts',
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_file_diff']>
  commitAll: (
    message: string,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_commit_all']>
  remoteStatus: (expectedRoot?: Scope) => Promise<DesktopCommandResults['git_remote_status']>
  setRemote: (
    name: string,
    url: string,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_remote_set']>
  removeRemote: (
    name: string,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_remote_remove']>
  fetch: (remote?: string, expectedRoot?: Scope) => Promise<DesktopCommandResults['git_fetch']>
  pull: (expectedRoot?: Scope) => Promise<DesktopCommandResults['git_pull']>
  push: (
    options?: { remote?: string; setUpstream?: boolean },
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_push']>
  stage: (paths: string[], expectedRoot?: Scope) => Promise<DesktopCommandResults['git_stage']>
  unstage: (paths: string[], expectedRoot?: Scope) => Promise<DesktopCommandResults['git_unstage']>
  discard: (paths: string[], expectedRoot?: Scope) => Promise<DesktopCommandResults['git_discard']>
  commitStaged: (
    message: string,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_commit_staged']>
  history: (
    options?: GitHistoryOptions,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_history']>
  branches: (expectedRoot?: Scope) => Promise<DesktopCommandResults['git_branches']>
  createBranch: (
    name: string,
    startPoint?: string,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_branch_create']>
  switchBranch: (
    name: string,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_branch_switch']>
  deleteBranch: (
    name: string,
    force?: boolean,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_branch_delete']>
  merge: (name: string, expectedRoot?: Scope) => Promise<DesktopCommandResults['git_merge']>
  rebase: (name: string, expectedRoot?: Scope) => Promise<DesktopCommandResults['git_rebase']>
  cherryPick: (
    commit: string,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_cherry_pick']>
  revert: (
    commit: string,
    mainline?: number,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_revert']>
  reset: (
    commit: string,
    mode: GitResetMode,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_reset']>
  stashes: (expectedRoot?: Scope) => Promise<DesktopCommandResults['git_stashes']>
  saveStash: (
    message?: string,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_stash_save']>
  applyStash: (
    ref: string,
    expectedRoot?: Scope,
    expectedHash?: string,
  ) => Promise<DesktopCommandResults['git_stash_apply']>
  dropStash: (
    ref: string,
    expectedRoot?: Scope,
    expectedHash?: string,
  ) => Promise<DesktopCommandResults['git_stash_drop']>
  operationState: (expectedRoot?: Scope) => Promise<DesktopCommandResults['git_operation_state']>
  conflict: (path: string, expectedRoot?: Scope) => Promise<DesktopCommandResults['git_conflict']>
  saveConflict: (
    request: GitConflictSaveRequest,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_conflict_save']>
  continueOperation: (
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_operation_continue']>
  abortOperation: (expectedRoot?: Scope) => Promise<DesktopCommandResults['git_operation_abort']>
  commitFiles: (
    commit: string,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_commit_files']>
  commitDiff: (
    commit: string,
    path: string,
    oldPath?: string,
    expectedRoot?: Scope,
  ) => Promise<DesktopCommandResults['git_commit_diff']>
}
