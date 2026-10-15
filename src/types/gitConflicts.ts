import { z } from 'zod'
import { gitStatusSnapshotSchema } from '@/services/gitSchemas'

export const gitConflictSnapshotSchema = z.object({
  path: z.string(),
  base: z.string().nullable(),
  ours: z.string().nullable(),
  theirs: z.string().nullable(),
  result: z.string(),
  revision: z.string().regex(/^[a-f0-9]{64}$/i),
  deleted: z.boolean(),
  markerSize: z.number().int().min(1).max(1024).optional(),
})
export const gitConflictSaveRequestSchema = z
  .object({
    path: z.string().min(1).max(32_768),
    content: z.string().max(1_048_576),
    revision: z.string().regex(/^[a-f0-9]{64}$/i),
    stage: z.boolean().optional(),
    deleteFile: z.boolean().optional(),
  })
  .strict()
export const gitConflictPathSchema = z.object({ path: z.string().min(1).max(32_768) }).strict()
export const gitConflictSaveResultSchema = z.object({
  status: gitStatusSnapshotSchema,
  revision: z.string().regex(/^[a-f0-9]{64}$/i),
  staged: z.boolean(),
})
export type GitConflictSnapshot = z.infer<typeof gitConflictSnapshotSchema>
export type GitConflictSaveRequest = z.infer<typeof gitConflictSaveRequestSchema>
export type GitConflictSaveResult = z.infer<typeof gitConflictSaveResultSchema>
