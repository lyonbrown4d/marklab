import type { GitHistoryOptions, GitResetMode } from '@/types/gitOperations'
import type { GitConflictSaveRequest } from '@/types/gitConflicts'

type Scope = string | undefined
export type ElectronGitApi = {
  discover: (expectedRoot?: Scope) => Promise<unknown>
  init: (expectedRoot?: Scope) => Promise<unknown>
  status: (expectedRoot?: Scope) => Promise<unknown>
  fileDiff: (
    path: string,
    section: 'staged' | 'unstaged' | 'untracked' | 'conflicts',
    expectedRoot?: Scope,
  ) => Promise<unknown>
  commitAll: (message: string, expectedRoot?: Scope) => Promise<unknown>
  remoteStatus: (expectedRoot?: Scope) => Promise<unknown>
  setRemote: (name: string, url: string, expectedRoot?: Scope) => Promise<unknown>
  removeRemote: (name: string, expectedRoot?: Scope) => Promise<unknown>
  fetch: (remote?: string, expectedRoot?: Scope) => Promise<unknown>
  pull: (expectedRoot?: Scope) => Promise<unknown>
  push: (
    options?: { remote?: string; setUpstream?: boolean },
    expectedRoot?: Scope,
  ) => Promise<unknown>
  stage: (paths: string[], expectedRoot?: Scope) => Promise<unknown>
  unstage: (paths: string[], expectedRoot?: Scope) => Promise<unknown>
  discard: (paths: string[], expectedRoot?: Scope) => Promise<unknown>
  commitStaged: (message: string, expectedRoot?: Scope) => Promise<unknown>
  history: (options?: GitHistoryOptions, expectedRoot?: Scope) => Promise<unknown>
  branches: (expectedRoot?: Scope) => Promise<unknown>
  createBranch: (name: string, startPoint?: string, expectedRoot?: Scope) => Promise<unknown>
  switchBranch: (name: string, expectedRoot?: Scope) => Promise<unknown>
  deleteBranch: (name: string, force?: boolean, expectedRoot?: Scope) => Promise<unknown>
  merge: (name: string, expectedRoot?: Scope) => Promise<unknown>
  rebase: (name: string, expectedRoot?: Scope) => Promise<unknown>
  cherryPick: (commit: string, expectedRoot?: Scope) => Promise<unknown>
  revert: (commit: string, mainline?: number, expectedRoot?: Scope) => Promise<unknown>
  reset: (commit: string, mode: GitResetMode, expectedRoot?: Scope) => Promise<unknown>
  stashes: (expectedRoot?: Scope) => Promise<unknown>
  saveStash: (message?: string, expectedRoot?: Scope) => Promise<unknown>
  applyStash: (ref: string, expectedRoot?: Scope, expectedHash?: string) => Promise<unknown>
  dropStash: (ref: string, expectedRoot?: Scope, expectedHash?: string) => Promise<unknown>
  operationState: (expectedRoot?: Scope) => Promise<unknown>
  conflict: (path: string, expectedRoot?: Scope) => Promise<unknown>
  saveConflict: (request: GitConflictSaveRequest, expectedRoot?: Scope) => Promise<unknown>
  continueOperation: (expectedRoot?: Scope) => Promise<unknown>
  abortOperation: (expectedRoot?: Scope) => Promise<unknown>
  commitFiles: (commit: string, expectedRoot?: Scope) => Promise<unknown>
  commitDiff: (
    commit: string,
    path: string,
    oldPath?: string,
    expectedRoot?: Scope,
  ) => Promise<unknown>
}
