import { z } from 'zod'

export const gitPreviewUnavailableReasonSchema = z.enum([
  'binary',
  'unsupported_encoding',
  'too_large',
])
export const gitPreviewUnavailableSchema = z.object({
  path: z.string(),
  unavailable_reason: gitPreviewUnavailableReasonSchema,
})
export type GitPreviewUnavailableReason = z.infer<typeof gitPreviewUnavailableReasonSchema>
export type GitPreviewUnavailable = z.infer<typeof gitPreviewUnavailableSchema>

export const gitOpenFileRequestSchema = z
  .object({
    path: z.string().min(1),
    section: z.enum(['staged', 'unstaged', 'untracked', 'conflicts']).optional(),
    commit: z
      .string()
      .regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i)
      .optional(),
    oldPath: z.string().min(1).optional(),
    action: z.enum(['preview', 'system']),
  })
  .strict()
export const gitOpenFileResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('opened') }),
  z.object({
    kind: z.literal('preview'),
    url: z.string().regex(/^marklab-asset:\/\/local\/v1\/[A-Za-z0-9_-]{43}$/),
    path: z.string(),
    label: z.string(),
    readonly: z.boolean(),
    snapshot: z.boolean(),
  }),
])
export type GitOpenFileRequest = z.infer<typeof gitOpenFileRequestSchema>
export type GitOpenFileResult = z.infer<typeof gitOpenFileResultSchema>
