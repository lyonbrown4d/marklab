import type { IpcRenderer } from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import type { ElectronGitApi } from '@/runtime/git'

export const createGitPreloadSurface = (ipc: Pick<IpcRenderer, 'invoke'>): ElectronGitApi => {
  const invoke = (
    channel: string,
    payload?: Record<string, unknown>,
    expectedRoot?: string,
  ): Promise<unknown> => {
    if (payload === undefined && expectedRoot === undefined) return ipc.invoke(channel)
    return ipc.invoke(channel, {
      ...payload,
      ...(expectedRoot === undefined ? {} : { expectedRoot }),
    })
  }
  return {
    discover: (root) => invoke(nativeIpcChannels.gitDiscover, undefined, root),
    init: (root) => invoke(nativeIpcChannels.gitInit, undefined, root),
    status: (root) => invoke(nativeIpcChannels.gitStatus, undefined, root),
    fileDiff: (path, section, root) =>
      invoke(nativeIpcChannels.gitFileDiff, { path, section }, root),
    openFile: (request, root) => invoke(nativeIpcChannels.gitOpenFile, request, root),
    commitAll: (message, root) => invoke(nativeIpcChannels.gitCommitAll, { message }, root),
    remoteStatus: (root) => invoke(nativeIpcChannels.gitRemoteStatus, undefined, root),
    setRemote: (name, url, root) => invoke(nativeIpcChannels.gitRemoteSet, { name, url }, root),
    removeRemote: (name, root) => invoke(nativeIpcChannels.gitRemoteRemove, { name }, root),
    fetch: (remote, root) => invoke(nativeIpcChannels.gitFetch, remote ? { remote } : {}, root),
    pull: (root) => invoke(nativeIpcChannels.gitPull, undefined, root),
    push: (options, root) => invoke(nativeIpcChannels.gitPush, options ?? {}, root),
    stage: (paths, root) => invoke(nativeIpcChannels.gitStage, { paths }, root),
    unstage: (paths, root) => invoke(nativeIpcChannels.gitUnstage, { paths }, root),
    discard: (paths, root) => invoke(nativeIpcChannels.gitDiscard, { paths }, root),
    commitStaged: (message, root) => invoke(nativeIpcChannels.gitCommitStaged, { message }, root),
    history: (options, root) => invoke(nativeIpcChannels.gitHistory, options ?? {}, root),
    branches: (root) => invoke(nativeIpcChannels.gitBranches, undefined, root),
    createBranch: (name, startPoint, root) =>
      invoke(nativeIpcChannels.gitBranchCreate, { name, startPoint }, root),
    switchBranch: (name, root) => invoke(nativeIpcChannels.gitBranchSwitch, { name }, root),
    deleteBranch: (name, force, root) =>
      invoke(nativeIpcChannels.gitBranchDelete, { name, force }, root),
    merge: (name, root) => invoke(nativeIpcChannels.gitMerge, { name }, root),
    rebase: (name, root) => invoke(nativeIpcChannels.gitRebase, { name }, root),
    cherryPick: (commit, root) => invoke(nativeIpcChannels.gitCherryPick, { commit }, root),
    revert: (commit, mainline, root) =>
      invoke(nativeIpcChannels.gitRevert, { commit, mainline }, root),
    reset: (commit, mode, root) => invoke(nativeIpcChannels.gitReset, { commit, mode }, root),
    stashes: (root) => invoke(nativeIpcChannels.gitStashes, undefined, root),
    saveStash: (message, root) => invoke(nativeIpcChannels.gitStashSave, { message }, root),
    applyStash: (ref, root, expectedHash) =>
      invoke(nativeIpcChannels.gitStashApply, { ref, expectedHash }, root),
    dropStash: (ref, root, expectedHash) =>
      invoke(nativeIpcChannels.gitStashDrop, { ref, expectedHash }, root),
    operationState: (root) => invoke(nativeIpcChannels.gitOperationState, undefined, root),
    conflict: (path, root) => invoke(nativeIpcChannels.gitConflict, { path }, root),
    saveConflict: (request, root) => invoke(nativeIpcChannels.gitConflictSave, request, root),
    continueOperation: (root) => invoke(nativeIpcChannels.gitOperationContinue, undefined, root),
    abortOperation: (root) => invoke(nativeIpcChannels.gitOperationAbort, undefined, root),
    commitFiles: (commit, root) => invoke(nativeIpcChannels.gitCommitFiles, { commit }, root),
    commitDiff: (commit, path, oldPath, root) =>
      invoke(nativeIpcChannels.gitCommitDiff, { commit, path, oldPath }, root),
  }
}
