import { getElectronRuntime } from '@/runtime/electron'
import { z } from 'zod'
import {
  gitConflictSnapshotSchema,
  gitConflictSaveResultSchema,
  type GitConflictSaveRequest,
} from '@/types/gitConflicts'
import {
  gitFileDiffSchema,
  gitRemoteStatusSchema,
  gitRepoInfoSchema,
  gitStatusSnapshotSchema,
} from '@/services/gitSchemas'
import {
  gitBranchSummarySchema,
  gitCommitFileSchema,
  gitCommitSummarySchema,
  gitOperationStateSchema,
  gitStashEntrySchema,
  type GitHistoryOptions,
  type GitResetMode,
} from '@/types/gitOperations'

export * from '@/services/gitSchemas'
export type {
  GitCommitSummary,
  GitBranchSummary,
  GitStashEntry,
  GitOperationState,
  GitHistoryOptions,
  GitResetMode,
  GitCommitFile,
} from '@/types/gitOperations'
const resetResultSchema = z.object({ status: gitStatusSnapshotSchema, backupBranch: z.string() })

// A bound facade prevents a stale UI action from targeting a newly selected workspace.
export const gitApiForWorkspace = (expectedRoot?: string) => ({
  async discoverRepo(rootPath: string) {
    return gitRepoInfoSchema.parse(
      await getElectronRuntime().git.discover(expectedRoot ?? rootPath),
    )
  },
  async initRepo(rootPath: string) {
    return gitRepoInfoSchema.parse(await getElectronRuntime().git.init(expectedRoot ?? rootPath))
  },
  async getStatus(rootPath: string) {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.status(expectedRoot ?? rootPath),
    )
  },
  async getFileDiff(
    rootPath: string,
    path: string,
    section: 'staged' | 'unstaged' | 'untracked' | 'conflicts',
  ) {
    return gitFileDiffSchema.parse(
      await getElectronRuntime().git.fileDiff(path, section, expectedRoot ?? rootPath),
    )
  },
  async commitAll(rootPath: string, message: string) {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.commitAll(message, expectedRoot ?? rootPath),
    )
  },
  async getRemoteStatus() {
    return gitRemoteStatusSchema.parse(await getElectronRuntime().git.remoteStatus(expectedRoot))
  },
  async setRemote(name: string, url: string) {
    return gitRemoteStatusSchema.parse(
      await getElectronRuntime().git.setRemote(name, url, expectedRoot),
    )
  },
  async removeRemote(name: string) {
    return gitRemoteStatusSchema.parse(
      await getElectronRuntime().git.removeRemote(name, expectedRoot),
    )
  },
  async fetch(remote?: string) {
    return gitRemoteStatusSchema.parse(await getElectronRuntime().git.fetch(remote, expectedRoot))
  },
  async pull() {
    return gitRemoteStatusSchema.parse(await getElectronRuntime().git.pull(expectedRoot))
  },
  async push(options?: { remote?: string; setUpstream?: boolean }) {
    return gitRemoteStatusSchema.parse(await getElectronRuntime().git.push(options, expectedRoot))
  },
  async stage(paths: string[]) {
    return gitStatusSnapshotSchema.parse(await getElectronRuntime().git.stage(paths, expectedRoot))
  },
  async unstage(paths: string[]) {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.unstage(paths, expectedRoot),
    )
  },
  async discard(paths: string[]) {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.discard(paths, expectedRoot),
    )
  },
  async commitStaged(message: string) {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.commitStaged(message, expectedRoot),
    )
  },
  async getHistory(options?: GitHistoryOptions) {
    return z
      .array(gitCommitSummarySchema)
      .parse(await getElectronRuntime().git.history(options, expectedRoot))
  },
  async getBranches() {
    return z
      .array(gitBranchSummarySchema)
      .parse(await getElectronRuntime().git.branches(expectedRoot))
  },
  async createBranch(name: string, startPoint?: string) {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.createBranch(name, startPoint, expectedRoot),
    )
  },
  async switchBranch(name: string) {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.switchBranch(name, expectedRoot),
    )
  },
  async deleteBranch(name: string, force?: boolean) {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.deleteBranch(name, force, expectedRoot),
    )
  },
  async merge(name: string) {
    return gitStatusSnapshotSchema.parse(await getElectronRuntime().git.merge(name, expectedRoot))
  },
  async rebase(name: string) {
    return gitStatusSnapshotSchema.parse(await getElectronRuntime().git.rebase(name, expectedRoot))
  },
  async cherryPick(commit: string) {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.cherryPick(commit, expectedRoot),
    )
  },
  async revert(commit: string, mainline?: number) {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.revert(commit, mainline, expectedRoot),
    )
  },
  async reset(commit: string, mode: GitResetMode) {
    return resetResultSchema.parse(await getElectronRuntime().git.reset(commit, mode, expectedRoot))
  },
  async getStashes() {
    return z.array(gitStashEntrySchema).parse(await getElectronRuntime().git.stashes(expectedRoot))
  },
  async saveStash(message?: string) {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.saveStash(message, expectedRoot),
    )
  },
  async applyStash(ref: string, expectedHash?: string) {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.applyStash(ref, expectedRoot, expectedHash),
    )
  },
  async dropStash(ref: string, expectedHash?: string) {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.dropStash(ref, expectedRoot, expectedHash),
    )
  },
  async getOperationState() {
    return gitOperationStateSchema.parse(
      await getElectronRuntime().git.operationState(expectedRoot),
    )
  },
  async getConflict(path: string) {
    return gitConflictSnapshotSchema.parse(
      await getElectronRuntime().git.conflict(path, expectedRoot),
    )
  },
  async saveConflict(request: GitConflictSaveRequest) {
    return gitConflictSaveResultSchema.parse(
      await getElectronRuntime().git.saveConflict(request, expectedRoot),
    )
  },
  async continueOperation() {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.continueOperation(expectedRoot),
    )
  },
  async abortOperation() {
    return gitStatusSnapshotSchema.parse(
      await getElectronRuntime().git.abortOperation(expectedRoot),
    )
  },
  async getCommitFiles(commit: string) {
    return z
      .array(gitCommitFileSchema)
      .parse(await getElectronRuntime().git.commitFiles(commit, expectedRoot))
  },
  async getCommitDiff(commit: string, path: string, oldPath?: string) {
    return gitFileDiffSchema.parse(
      await getElectronRuntime().git.commitDiff(commit, path, oldPath, expectedRoot),
    )
  },
})

export const gitApi = gitApiForWorkspace()
export type WorkspaceGitApi = ReturnType<typeof gitApiForWorkspace>
