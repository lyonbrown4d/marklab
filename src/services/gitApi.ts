import { getDesktopRuntime } from '@/runtime/desktop'
import { gitOpenFileResultSchema, type GitOpenFileRequest } from '@/types/gitPreview'
import { z } from 'zod'
import {
  gitConflictPreviewSchema,
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
  async openFile(request: GitOpenFileRequest) {
    return gitOpenFileResultSchema.parse(
      await getDesktopRuntime().git.openFile(request, expectedRoot),
    )
  },
  async discoverRepo(rootPath: string) {
    return gitRepoInfoSchema.parse(await getDesktopRuntime().git.discover(expectedRoot ?? rootPath))
  },
  async initRepo(rootPath: string) {
    return gitRepoInfoSchema.parse(await getDesktopRuntime().git.init(expectedRoot ?? rootPath))
  },
  async getStatus(rootPath: string) {
    return gitStatusSnapshotSchema.parse(
      await getDesktopRuntime().git.status(expectedRoot ?? rootPath),
    )
  },
  async getFileDiff(
    rootPath: string,
    path: string,
    section: 'staged' | 'unstaged' | 'untracked' | 'conflicts',
  ) {
    return gitFileDiffSchema.parse(
      await getDesktopRuntime().git.fileDiff(path, section, expectedRoot ?? rootPath),
    )
  },
  async commitAll(rootPath: string, message: string) {
    return gitStatusSnapshotSchema.parse(
      await getDesktopRuntime().git.commitAll(message, expectedRoot ?? rootPath),
    )
  },
  async getRemoteStatus() {
    return gitRemoteStatusSchema.parse(await getDesktopRuntime().git.remoteStatus(expectedRoot))
  },
  async setRemote(name: string, url: string) {
    return gitRemoteStatusSchema.parse(
      await getDesktopRuntime().git.setRemote(name, url, expectedRoot),
    )
  },
  async removeRemote(name: string) {
    return gitRemoteStatusSchema.parse(
      await getDesktopRuntime().git.removeRemote(name, expectedRoot),
    )
  },
  async fetch(remote?: string) {
    return gitRemoteStatusSchema.parse(await getDesktopRuntime().git.fetch(remote, expectedRoot))
  },
  async pull() {
    return gitRemoteStatusSchema.parse(await getDesktopRuntime().git.pull(expectedRoot))
  },
  async push(options?: { remote?: string; setUpstream?: boolean }) {
    return gitRemoteStatusSchema.parse(await getDesktopRuntime().git.push(options, expectedRoot))
  },
  async stage(paths: string[]) {
    return gitStatusSnapshotSchema.parse(await getDesktopRuntime().git.stage(paths, expectedRoot))
  },
  async unstage(paths: string[]) {
    return gitStatusSnapshotSchema.parse(await getDesktopRuntime().git.unstage(paths, expectedRoot))
  },
  async discard(paths: string[]) {
    return gitStatusSnapshotSchema.parse(await getDesktopRuntime().git.discard(paths, expectedRoot))
  },
  async commitStaged(message: string) {
    return gitStatusSnapshotSchema.parse(
      await getDesktopRuntime().git.commitStaged(message, expectedRoot),
    )
  },
  async getHistory(options?: GitHistoryOptions) {
    return z
      .array(gitCommitSummarySchema)
      .parse(await getDesktopRuntime().git.history(options, expectedRoot))
  },
  async getBranches() {
    return z
      .array(gitBranchSummarySchema)
      .parse(await getDesktopRuntime().git.branches(expectedRoot))
  },
  async createBranch(name: string, startPoint?: string) {
    return gitStatusSnapshotSchema.parse(
      await getDesktopRuntime().git.createBranch(name, startPoint, expectedRoot),
    )
  },
  async switchBranch(name: string) {
    return gitStatusSnapshotSchema.parse(
      await getDesktopRuntime().git.switchBranch(name, expectedRoot),
    )
  },
  async deleteBranch(name: string, force?: boolean) {
    return gitStatusSnapshotSchema.parse(
      await getDesktopRuntime().git.deleteBranch(name, force, expectedRoot),
    )
  },
  async merge(name: string) {
    return gitStatusSnapshotSchema.parse(await getDesktopRuntime().git.merge(name, expectedRoot))
  },
  async rebase(name: string) {
    return gitStatusSnapshotSchema.parse(await getDesktopRuntime().git.rebase(name, expectedRoot))
  },
  async cherryPick(commit: string) {
    return gitStatusSnapshotSchema.parse(
      await getDesktopRuntime().git.cherryPick(commit, expectedRoot),
    )
  },
  async revert(commit: string, mainline?: number) {
    return gitStatusSnapshotSchema.parse(
      await getDesktopRuntime().git.revert(commit, mainline, expectedRoot),
    )
  },
  async reset(commit: string, mode: GitResetMode) {
    return resetResultSchema.parse(await getDesktopRuntime().git.reset(commit, mode, expectedRoot))
  },
  async getStashes() {
    return z.array(gitStashEntrySchema).parse(await getDesktopRuntime().git.stashes(expectedRoot))
  },
  async saveStash(message?: string) {
    return gitStatusSnapshotSchema.parse(
      await getDesktopRuntime().git.saveStash(message, expectedRoot),
    )
  },
  async applyStash(ref: string, expectedHash?: string) {
    return gitStatusSnapshotSchema.parse(
      await getDesktopRuntime().git.applyStash(ref, expectedRoot, expectedHash),
    )
  },
  async dropStash(ref: string, expectedHash?: string) {
    return gitStatusSnapshotSchema.parse(
      await getDesktopRuntime().git.dropStash(ref, expectedRoot, expectedHash),
    )
  },
  async getOperationState() {
    return gitOperationStateSchema.parse(await getDesktopRuntime().git.operationState(expectedRoot))
  },
  async getConflict(path: string) {
    return gitConflictPreviewSchema.parse(
      await getDesktopRuntime().git.conflict(path, expectedRoot),
    )
  },
  async saveConflict(request: GitConflictSaveRequest) {
    return gitConflictSaveResultSchema.parse(
      await getDesktopRuntime().git.saveConflict(request, expectedRoot),
    )
  },
  async continueOperation() {
    return gitStatusSnapshotSchema.parse(
      await getDesktopRuntime().git.continueOperation(expectedRoot),
    )
  },
  async abortOperation() {
    return gitStatusSnapshotSchema.parse(await getDesktopRuntime().git.abortOperation(expectedRoot))
  },
  async getCommitFiles(commit: string) {
    return z
      .array(gitCommitFileSchema)
      .parse(await getDesktopRuntime().git.commitFiles(commit, expectedRoot))
  },
  async getCommitDiff(commit: string, path: string, oldPath?: string) {
    return gitFileDiffSchema.parse(
      await getDesktopRuntime().git.commitDiff(commit, path, oldPath, expectedRoot),
    )
  },
})

export const gitApi = gitApiForWorkspace()
export type WorkspaceGitApi = ReturnType<typeof gitApiForWorkspace>
