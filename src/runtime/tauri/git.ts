import type { DesktopGitApi } from '@/runtime/git'
import { request } from '@/runtime/tauri/transport'

export const createGitApi = (): DesktopGitApi => {
  return {
    discover: (root) => request('git_discover', { expectedRoot: root }),
    init: (root) => request('git_init', { expectedRoot: root }),
    status: (root) => request('git_status', { expectedRoot: root }),
    fileDiff: (path, section, root) =>
      request('git_file_diff', { path, section, expectedRoot: root }),
    openFile: (payload, root) => request('git_open_file', { ...payload, expectedRoot: root }),
    commitAll: (message, root) => request('git_commit_all', { message, expectedRoot: root }),
    remoteStatus: (root) => request('git_remote_status', { expectedRoot: root }),
    setRemote: (name, url, root) => request('git_remote_set', { name, url, expectedRoot: root }),
    removeRemote: (name, root) => request('git_remote_remove', { name, expectedRoot: root }),
    fetch: (remote, root) => request('git_fetch', { remote, expectedRoot: root }),
    pull: (root) => request('git_pull', { expectedRoot: root }),
    push: (options, root) => request('git_push', { ...options, expectedRoot: root }),
    stage: (paths, root) => request('git_stage', { paths, expectedRoot: root }),
    unstage: (paths, root) => request('git_unstage', { paths, expectedRoot: root }),
    discard: (paths, root) => request('git_discard', { paths, expectedRoot: root }),
    commitStaged: (message, root) => request('git_commit_staged', { message, expectedRoot: root }),
    history: (options, root) => request('git_history', { ...options, expectedRoot: root }),
    branches: (root) => request('git_branches', { expectedRoot: root }),
    createBranch: (name, startPoint, root) =>
      request('git_branch_create', { name, startPoint, expectedRoot: root }),
    switchBranch: (name, root) => request('git_branch_switch', { name, expectedRoot: root }),
    deleteBranch: (name, force, root) =>
      request('git_branch_delete', { name, force, expectedRoot: root }),
    merge: (name, root) => request('git_merge', { name, expectedRoot: root }),
    rebase: (name, root) => request('git_rebase', { name, expectedRoot: root }),
    cherryPick: (commit, root) => request('git_cherry_pick', { commit, expectedRoot: root }),
    revert: (commit, mainline, root) =>
      request('git_revert', { commit, mainline, expectedRoot: root }),
    reset: (commit, mode, root) => request('git_reset', { commit, mode, expectedRoot: root }),
    stashes: (root) => request('git_stashes', { expectedRoot: root }),
    saveStash: (message, root) => request('git_stash_save', { message, expectedRoot: root }),
    applyStash: (ref, root, expectedHash) =>
      request('git_stash_apply', { ref, expectedHash, expectedRoot: root }),
    dropStash: (ref, root, expectedHash) =>
      request('git_stash_drop', { ref, expectedHash, expectedRoot: root }),
    operationState: (root) => request('git_operation_state', { expectedRoot: root }),
    conflict: (path, root) => request('git_conflict', { path, expectedRoot: root }),
    saveConflict: (payload, root) =>
      request('git_conflict_save', { ...payload, expectedRoot: root }),
    continueOperation: (root) => request('git_operation_continue', { expectedRoot: root }),
    abortOperation: (root) => request('git_operation_abort', { expectedRoot: root }),
    commitFiles: (commit, root) => request('git_commit_files', { commit, expectedRoot: root }),
    commitDiff: (commit, path, oldPath, root) =>
      request('git_commit_diff', { commit, path, oldPath, expectedRoot: root }),
  }
}
