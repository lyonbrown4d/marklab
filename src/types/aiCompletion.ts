import type {
  DesktopCommandArgs,
  DesktopCommandResults,
  DesktopEventPayloads,
} from '@/generated/desktop/bindings'
import { z } from 'zod'

const providerIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)

export const aiCompletionLanguageSchema = z.enum(['auto', 'zh-CN', 'en']) satisfies z.ZodType<
  AiInlineCompletionRequest['language']
>

export const aiCompletionLengthSchema = z.enum([
  'short',
  'medium',
  'long',
]) satisfies z.ZodType<AiCompletionLength>

export const aiInlineCompletionRequestSchema = z
  .object({
    providerId: providerIdSchema,
    completionSessionId: z.string().min(1).max(128),
    revision: z.number().int().nonnegative().max(2_147_483_647),
    prefix: z.string().min(1).max(8_192),
    suffix: z.string().max(4_096),
    heading: z.string().max(512).nullish(),
    language: aiCompletionLanguageSchema,
    length: aiCompletionLengthSchema,
    excludedSuggestions: z.array(z.string().min(1).max(512)).max(2),
  })
  .strict() satisfies z.ZodType<AiInlineCompletionRequest>

export const aiInlineCompletionStartResultSchema = z
  .object({ requestId: z.string().min(1).max(128) })
  .strict() satisfies z.ZodType<AiInlineCompletionStartResult>

export type AiCompletionLength = DesktopCommandArgs['ai_completion_start']['request']['length']

export type AiInlineCompletionRequest = DesktopCommandArgs['ai_completion_start']['request']

export type AiInlineCompletionStartResult = DesktopCommandResults['ai_completion_start']

export type AiInlineCompletionEvent = DesktopEventPayloads['ai-completion-event']
