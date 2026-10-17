import type { DesktopGitApi } from '@/runtime/git'
import { request } from '@/runtime/tauri/transport'

export const createGitApi = (): DesktopGitApi => {
  const run = (command: string, payload = {}, expectedRoot?: string): Promise<unknown> =>
    request(command, { ...payload, ...(expectedRoot === undefined ? {} : { expectedRoot }) })
  return {
    discover: (root) => run('git_discover', {}, root),
    init: (root) => run('git_init', {}, root),
    status: (root) => run('git_status', {}, root),
    fileDiff: (path, section, root) => run('git_file_diff', { path, section }, root),
    openFile: (payload, root) => run('git_open_file', payload, root),
    commitAll: (message, root) => run('git_commit_all', { message }, root),
    remoteStatus: (root) => run('git_remote_status', {}, root),
    setRemote: (name, url, root) => run('git_remote_set', { name, url }, root),
    removeRemote: (name, root) => run('git_remote_remove', { name }, root),
    fetch: (remote, root) => run('git_fetch', { remote }, root),
    pull: (root) => run('git_pull', {}, root),
    push: (options, root) => run('git_push', options, root),
    stage: (paths, root) => run('git_stage', { paths }, root),
    unstage: (paths, root) => run('git_unstage', { paths }, root),
    discard: (paths, root) => run('git_discard', { paths }, root),
    commitStaged: (message, root) => run('git_commit_staged', { message }, root),
    history: (options, root) => run('git_history', options, root),
    branches: (root) => run('git_branches', {}, root),
    createBranch: (name, startPoint, root) => run('git_branch_create', { name, startPoint }, root),
    switchBranch: (name, root) => run('git_branch_switch', { name }, root),
    deleteBranch: (name, force, root) => run('git_branch_delete', { name, force }, root),
    merge: (name, root) => run('git_merge', { name }, root),
    rebase: (name, root) => run('git_rebase', { name }, root),
    cherryPick: (commit, root) => run('git_cherry_pick', { commit }, root),
    revert: (commit, mainline, root) => run('git_revert', { commit, mainline }, root),
    reset: (commit, mode, root) => run('git_reset', { commit, mode }, root),
    stashes: (root) => run('git_stashes', {}, root),
    saveStash: (message, root) => run('git_stash_save', { message }, root),
    applyStash: (ref, root, expectedHash) => run('git_stash_apply', { ref, expectedHash }, root),
    dropStash: (ref, root, expectedHash) => run('git_stash_drop', { ref, expectedHash }, root),
    operationState: (root) => run('git_operation_state', {}, root),
    conflict: (path, root) => run('git_conflict', { path }, root),
    saveConflict: (payload, root) => run('git_conflict_save', payload, root),
    continueOperation: (root) => run('git_operation_continue', {}, root),
    abortOperation: (root) => run('git_operation_abort', {}, root),
    commitFiles: (commit, root) => run('git_commit_files', { commit }, root),
    commitDiff: (commit, path, oldPath, root) =>
      run('git_commit_diff', { commit, path, oldPath }, root),
  }
}
