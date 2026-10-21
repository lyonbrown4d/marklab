import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'
import { z } from 'zod'
import { gitStatusSnapshotSchema } from '@/services/gitSchemas'
import { gitPreviewUnavailableSchema } from '@/types/gitPreview'

export const gitConflictSnapshotSchema = z.object({
  path: z.string(),
  base: z.string().nullable(),
  ours: z.string().nullable(),
  theirs: z.string().nullable(),
  result: z.string(),
  revision: z.string().regex(/^[a-f0-9]{64}$/i),
  deleted: z.boolean(),
  markerSize: z.number().int().min(1).max(1024),
}) satisfies z.ZodType<GitConflictSnapshot>

export const gitConflictSaveRequestSchema = z
  .object({
    path: z.string().min(1).max(32_768),
    content: z.string().max(1_048_576),
    revision: z.string().regex(/^[a-f0-9]{64}$/i),
    stage: z.boolean().nullish(),
    deleteFile: z.boolean().nullish(),
  })
  .strict() satisfies z.ZodType<GitConflictSaveRequest>

export const gitConflictPathSchema = z
  .object({ path: z.string().min(1).max(32_768) })
  .strict() satisfies z.ZodType<DesktopCommandArgs['git_conflict']['request']>

export const gitConflictSaveResultSchema = z.object({
  status: gitStatusSnapshotSchema,
  revision: z.string().regex(/^[a-f0-9]{64}$/i),
  staged: z.boolean(),
}) satisfies z.ZodType<GitConflictSaveResult>

export type GitConflictSnapshot = Exclude<
  DesktopCommandResults['git_conflict'],
  { unavailable_reason: string }
>

export const gitConflictPreviewSchema = z.union([
  gitPreviewUnavailableSchema,
  gitConflictSnapshotSchema,
]) satisfies z.ZodType<GitConflictPreview>

export type GitConflictPreview = DesktopCommandResults['git_conflict']

export type GitConflictSaveRequest = DesktopCommandArgs['git_conflict_save']['request']

export type GitConflictSaveResult = DesktopCommandResults['git_conflict_save']
