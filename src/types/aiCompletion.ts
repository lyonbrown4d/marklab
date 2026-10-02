import { z } from 'zod'

const providerIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)

export const aiCompletionLanguageSchema = z.enum(['auto', 'zh-CN', 'en'])
export const aiCompletionLengthSchema = z.enum(['short', 'medium', 'long'])

export const aiInlineCompletionRequestSchema = z
  .object({
    providerId: providerIdSchema,
    completionSessionId: z.string().min(1).max(128),
    revision: z.number().int().nonnegative().max(2_147_483_647),
    prefix: z.string().min(1).max(8_192),
    suffix: z.string().max(4_096),
    heading: z.string().max(512).optional(),
    language: aiCompletionLanguageSchema,
    length: aiCompletionLengthSchema,
    excludedSuggestions: z.array(z.string().min(1).max(512)).max(2),
  })
  .strict()

export const aiInlineCompletionStartResultSchema = z
  .object({ requestId: z.string().min(1).max(128) })
  .strict()

export type AiCompletionLength = z.infer<typeof aiCompletionLengthSchema>
export type AiInlineCompletionRequest = z.infer<typeof aiInlineCompletionRequestSchema>
export type AiInlineCompletionStartResult = z.infer<typeof aiInlineCompletionStartResultSchema>

export type AiInlineCompletionEvent =
  | { requestId: string; type: 'delta'; delta: string }
  | {
      requestId: string
      type: 'finish'
      finishReason: string
      usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
      warnings: string[]
    }
  | { requestId: string; type: 'error'; message: string }
  | { requestId: string; type: 'cancelled' }
