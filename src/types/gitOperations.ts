import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'
import { z } from 'zod'

export const gitPathsSchema = z
  .object({
    paths: z.array(z.string().min(1).max(32_768)).min(1).max(10_000),
  })
  .strict() satisfies z.ZodType<DesktopCommandArgs['git_stage']['request']>

export const gitCommitIdSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i)
export const gitCommitRequestSchema = z
  .object({ message: z.string().trim().min(1).max(10_000) })
  .strict() satisfies z.ZodType<DesktopCommandArgs['git_commit_staged']['request']>

export const gitBranchRequestSchema = z
  .object({ name: z.string().trim().min(1).max(1024) })
  .strict() satisfies z.ZodType<DesktopCommandArgs['git_branch_switch']['request']>

export const gitCreateBranchSchema = gitBranchRequestSchema
  .extend({ startPoint: z.string().trim().min(1).max(1024).nullish() })
  .strict() satisfies z.ZodType<DesktopCommandArgs['git_branch_create']['request']>

export const gitDeleteBranchSchema = gitBranchRequestSchema
  .extend({ force: z.boolean().nullish() })
  .strict() satisfies z.ZodType<DesktopCommandArgs['git_branch_delete']['request']>

export const gitHistoryOptionsSchema = z
  .object({
    limit: z.number().int().min(1).max(200).nullish(),
    skip: z.number().int().min(0).max(100_000).nullish(),
  })
  .strict() satisfies z.ZodType<GitHistoryOptions>

export const gitRevisionRequestSchema = z
  .object({ commit: gitCommitIdSchema })
  .strict() satisfies z.ZodType<DesktopCommandArgs['git_cherry_pick']['request']>

export const gitRevertRequestSchema = gitRevisionRequestSchema
  .extend({ mainline: z.number().int().min(1).max(16).nullish() })
  .strict() satisfies z.ZodType<DesktopCommandArgs['git_revert']['request']>

export const gitResetModeSchema = z.enum([
  'soft',
  'mixed',
  'hard',
]) satisfies z.ZodType<GitResetMode>

export const gitResetRequestSchema = gitRevisionRequestSchema
  .extend({ mode: gitResetModeSchema })
  .strict() satisfies z.ZodType<DesktopCommandArgs['git_reset']['request']>

export const gitStashSaveSchema = z
  .object({ message: z.string().trim().max(10_000).nullish() })
  .strict() satisfies z.ZodType<DesktopCommandArgs['git_stash_save']['request']>

export const gitStashRequestSchema = z
  .object({
    ref: z.string().regex(/^stash@\{\d+\}$/),
    expectedHash: gitCommitIdSchema.nullish(),
  })
  .strict() satisfies z.ZodType<DesktopCommandArgs['git_stash_apply']['request']>

export const gitCommitDiffRequestSchema = gitRevisionRequestSchema
  .extend({
    path: z.string().min(1).max(32_768),
    oldPath: z.string().min(1).max(32_768).nullish(),
  })
  .strict() satisfies z.ZodType<DesktopCommandArgs['git_commit_diff']['request']>

export const gitCommitSummarySchema = z.object({
  hash: gitCommitIdSchema,
  shortHash: z.string(),
  subject: z.string(),
  author: z.string(),
  date: z.string(),
  parents: z.array(gitCommitIdSchema),
}) satisfies z.ZodType<GitCommitSummary>

export const gitBranchSummarySchema = z.object({
  name: z.string(),
  current: z.boolean(),
  remote: z.boolean(),
}) satisfies z.ZodType<GitBranchSummary>

export const gitStashEntrySchema = z.object({
  ref: z.string(),
  hash: gitCommitIdSchema,
  subject: z.string(),
}) satisfies z.ZodType<GitStashEntry>

export const gitOperationStateSchema = z.object({
  operation: z.enum(['merge', 'rebase', 'revert', 'cherry-pick']).nullable(),
}) satisfies z.ZodType<GitOperationState>

export const gitCommitFileSchema = z.object({
  path: z.string(),
  old_path: z.string().nullable(),
  status: z.enum(['A', 'D', 'R', 'C', 'T', 'M']),
}) satisfies z.ZodType<GitCommitFile>

export type GitCommitSummary = DesktopCommandResults['git_history'][number]

export type GitBranchSummary = DesktopCommandResults['git_branches'][number]

export type GitStashEntry = DesktopCommandResults['git_stashes'][number]

export type GitOperationState = DesktopCommandResults['git_operation_state']

export type GitHistoryOptions = DesktopCommandArgs['git_history']['request']

export type GitResetMode = NonNullable<DesktopCommandArgs['git_reset']['request']['mode']>

export type GitCommitFile = DesktopCommandResults['git_commit_files'][number]
