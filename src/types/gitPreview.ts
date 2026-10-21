import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'
import { z } from 'zod'

export const gitPreviewUnavailableReasonSchema = z.enum([
  'binary',
  'unsupported_encoding',
  'too_large',
]) satisfies z.ZodType<GitPreviewUnavailableReason>

export const gitPreviewUnavailableSchema = z.object({
  path: z.string(),
  unavailable_reason: gitPreviewUnavailableReasonSchema,
}) satisfies z.ZodType<GitPreviewUnavailable>

export type GitPreviewUnavailableReason = NonNullable<
  DesktopCommandResults['git_file_diff']['unavailable_reason']
>

export type GitPreviewUnavailable = Extract<
  DesktopCommandResults['git_conflict'],
  { unavailable_reason: string }
>

export const gitOpenFileRequestSchema = z
  .object({
    path: z.string().min(1),
    section: z.enum(['staged', 'unstaged', 'untracked', 'conflicts']).nullish(),
    commit: z
      .string()
      .regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i)
      .nullish(),
    oldPath: z.string().min(1).nullish(),
    action: z.enum(['preview', 'system']),
  })
  .strict() satisfies z.ZodType<GitOpenFileRequest>

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
]) satisfies z.ZodType<GitOpenFileResult>

export type GitOpenFileRequest = DesktopCommandArgs['git_open_file']['request']

export type GitOpenFileResult = DesktopCommandResults['git_open_file']
