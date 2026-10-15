import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { nativeIpcChannels as channels } from '@electron/channels'
import type { GitService } from '@electron/services/git/service'
import type { createGitWorkspaceContext } from '@electron/ipc/gitWorkspaceContext'
import { gitScopeSchema, withGitScope } from '@electron/ipc/gitIpcScope'
import { gitConflictPathSchema, gitConflictSaveRequestSchema } from '@/types/gitConflicts'
import {
  gitBranchRequestSchema,
  gitCommitDiffRequestSchema,
  gitCommitRequestSchema,
  gitCreateBranchSchema,
  gitDeleteBranchSchema,
  gitHistoryOptionsSchema,
  gitPathsSchema,
  gitResetRequestSchema,
  gitRevertRequestSchema,
  gitRevisionRequestSchema,
  gitStashRequestSchema,
  gitStashSaveSchema,
} from '@/types/gitOperations'

type Dependencies = ReturnType<typeof createGitWorkspaceContext> & { git: GitService }
type ScopedInput = { expectedRoot?: string }

export const registerGitOperationsIpc = (
  ipc: IpcMain,
  { git, rootFor, mutateWorkspace }: Dependencies,
): void => {
  const query = <Input extends ScopedInput>(
    channel: string,
    schema: z.ZodType<Input>,
    work: (root: string, input: Input) => Promise<unknown>,
  ) => {
    ipc.handle(channel, (event: IpcMainInvokeEvent, payload: unknown) => {
      const input = schema.parse(payload ?? {})
      return work(rootFor(event, input.expectedRoot), input)
    })
  }
  const mutation = <Input extends ScopedInput>(
    channel: string,
    schema: z.ZodType<Input>,
    work: (root: string, input: Input) => Promise<unknown>,
    content = true,
  ) => {
    ipc.handle(channel, (event: IpcMainInvokeEvent, payload: unknown) => {
      const input = schema.parse(payload ?? {})
      return mutateWorkspace(event, (root) => work(root, input), {
        expectedRoot: input.expectedRoot,
        flush: content,
        lockWorkspace: content,
        invalidate: content,
      })
    })
  }
  const paths = withGitScope(gitPathsSchema)
  const branch = withGitScope(gitBranchRequestSchema)
  const revision = withGitScope(gitRevisionRequestSchema)
  const stash = withGitScope(gitStashRequestSchema)

  mutation(channels.gitStage, paths, (root, input) => git.stage(root, input.paths))
  mutation(channels.gitUnstage, paths, (root, input) => git.unstage(root, input.paths))
  mutation(channels.gitDiscard, paths, (root, input) => git.discard(root, input.paths))
  mutation(channels.gitCommitStaged, withGitScope(gitCommitRequestSchema), (root, input) =>
    git.commitStaged(root, input.message),
  )
  query(channels.gitHistory, withGitScope(gitHistoryOptionsSchema), (root, input) =>
    git.history(root, { limit: input.limit, skip: input.skip }),
  )
  query(channels.gitBranches, gitScopeSchema, (root) => git.branches(root))
  mutation(channels.gitBranchCreate, withGitScope(gitCreateBranchSchema), (root, input) =>
    git.createBranch(root, input.name, input.startPoint),
  )
  mutation(channels.gitBranchSwitch, branch, (root, input) => git.switchBranch(root, input.name))
  mutation(
    channels.gitBranchDelete,
    withGitScope(gitDeleteBranchSchema),
    (root, input) => git.deleteBranch(root, input.name, input.force),
    false,
  )
  mutation(channels.gitMerge, branch, (root, input) => git.merge(root, input.name))
  mutation(channels.gitRebase, branch, (root, input) => git.rebase(root, input.name))
  mutation(channels.gitCherryPick, revision, (root, input) => git.cherryPick(root, input.commit))
  mutation(channels.gitRevert, withGitScope(gitRevertRequestSchema), (root, input) =>
    git.revert(root, input.commit, input.mainline),
  )
  mutation(channels.gitReset, withGitScope(gitResetRequestSchema), (root, input) =>
    git.reset(root, input.commit, input.mode),
  )
  query(channels.gitStashes, gitScopeSchema, (root) => git.stashList(root))
  mutation(channels.gitStashSave, withGitScope(gitStashSaveSchema), (root, input) =>
    git.stashSave(root, input.message),
  )
  mutation(channels.gitStashApply, stash, (root, input) =>
    git.stashApply(root, input.ref, input.expectedHash),
  )
  mutation(
    channels.gitStashDrop,
    stash,
    (root, input) => git.stashDrop(root, input.ref, input.expectedHash),
    false,
  )
  query(channels.gitOperationState, gitScopeSchema, (root) => git.operationState(root))
  query(channels.gitConflict, withGitScope(gitConflictPathSchema), (root, input) =>
    git.conflict(root, input.path),
  )
  mutation(channels.gitConflictSave, withGitScope(gitConflictSaveRequestSchema), (root, input) => {
    return git.saveConflict(root, {
      path: input.path,
      content: input.content,
      revision: input.revision,
      stage: input.stage,
      deleteFile: input.deleteFile,
    })
  })
  mutation(channels.gitOperationContinue, gitScopeSchema, (root) => git.continueOperation(root))
  mutation(channels.gitOperationAbort, gitScopeSchema, (root) => git.abortOperation(root))
  query(channels.gitCommitFiles, revision, (root, input) => git.commitFiles(root, input.commit))
  query(channels.gitCommitDiff, withGitScope(gitCommitDiffRequestSchema), (root, input) =>
    git.commitDiff(root, input.commit, input.path, input.oldPath),
  )
}
