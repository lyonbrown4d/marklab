import { z } from 'zod'

export const gitPathsSchema = z
  .object({
    paths: z.array(z.string().min(1).max(32_768)).min(1).max(10_000),
  })
  .strict()
export const gitCommitIdSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i)
export const gitCommitRequestSchema = z
  .object({ message: z.string().trim().min(1).max(10_000) })
  .strict()
export const gitBranchRequestSchema = z
  .object({ name: z.string().trim().min(1).max(1024) })
  .strict()
export const gitCreateBranchSchema = gitBranchRequestSchema
  .extend({ startPoint: z.string().trim().min(1).max(1024).optional() })
  .strict()
export const gitDeleteBranchSchema = gitBranchRequestSchema
  .extend({ force: z.boolean().optional() })
  .strict()
export const gitHistoryOptionsSchema = z
  .object({
    limit: z.number().int().min(1).max(200).optional(),
    skip: z.number().int().min(0).max(100_000).optional(),
  })
  .strict()
export const gitRevisionRequestSchema = z.object({ commit: gitCommitIdSchema }).strict()
export const gitRevertRequestSchema = gitRevisionRequestSchema
  .extend({ mainline: z.number().int().min(1).max(16).optional() })
  .strict()
export const gitResetModeSchema = z.enum(['soft', 'mixed', 'hard'])
export const gitResetRequestSchema = gitRevisionRequestSchema
  .extend({ mode: gitResetModeSchema })
  .strict()
export const gitStashSaveSchema = z
  .object({ message: z.string().trim().max(10_000).optional() })
  .strict()
export const gitStashRequestSchema = z
  .object({
    ref: z.string().regex(/^stash@\{\d+\}$/),
    expectedHash: gitCommitIdSchema.optional(),
  })
  .strict()
export const gitCommitDiffRequestSchema = gitRevisionRequestSchema
  .extend({
    path: z.string().min(1).max(32_768),
    oldPath: z.string().min(1).max(32_768).optional(),
  })
  .strict()

export const gitCommitSummarySchema = z.object({
  hash: gitCommitIdSchema,
  shortHash: z.string(),
  subject: z.string(),
  author: z.string(),
  date: z.string(),
  parents: z.array(gitCommitIdSchema),
})
export const gitBranchSummarySchema = z.object({
  name: z.string(),
  current: z.boolean(),
  remote: z.boolean(),
})
export const gitStashEntrySchema = z.object({
  ref: z.string(),
  hash: gitCommitIdSchema,
  subject: z.string(),
})
export const gitOperationStateSchema = z.object({
  operation: z.enum(['merge', 'rebase', 'revert', 'cherry-pick']).nullable(),
})
export const gitCommitFileSchema = z.object({
  path: z.string(),
  old_path: z.string().nullable().optional(),
  status: z.string(),
})

export type GitCommitSummary = z.infer<typeof gitCommitSummarySchema>
export type GitBranchSummary = z.infer<typeof gitBranchSummarySchema>
export type GitStashEntry = z.infer<typeof gitStashEntrySchema>
export type GitOperationState = z.infer<typeof gitOperationStateSchema>
export type GitHistoryOptions = z.infer<typeof gitHistoryOptionsSchema>
export type GitResetMode = z.infer<typeof gitResetModeSchema>
export type GitCommitFile = z.infer<typeof gitCommitFileSchema>
